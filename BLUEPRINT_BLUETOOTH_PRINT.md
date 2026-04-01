# Blueprint: Bluetooth Thermal Printing (Web Bluetooth API)

Dokumen ini berisi panduan lengkap untuk mengimplementasikan fitur cetak struk ke printer thermal 58mm menggunakan Web Bluetooth API di aplikasi web (React/TypeScript).

## 1. Persiapan Metadata & Izin

Web Bluetooth API memerlukan izin khusus. Jika menggunakan AI Studio, tambahkan ini ke `metadata.json`. Jika aplikasi web standar, pastikan aplikasi berjalan di **HTTPS**.

```json
{
  "requestFramePermissions": ["bluetooth"]
}
```

## 2. Definisi Tipe Data (TypeScript)

Buat file `src/bluetooth.d.ts` untuk mendukung API Bluetooth di TypeScript.

```typescript
interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  forget(): Promise<void>;
  watchAdvertisements(options?: WatchAdvertisementsOptions): Promise<void>;
  readonly watchingAdvertisements: boolean;
}

interface BluetoothRemoteGATTServer {
  readonly device: BluetoothDevice;
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService extends EventTarget {
  readonly device: BluetoothDevice;
  readonly uuid: string;
  readonly isPrimary: boolean;
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly service: BluetoothRemoteGATTService;
  readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties;
  readonly value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface Bluetooth extends EventTarget {
  getDevices(): Promise<BluetoothDevice[]>;
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  getAvailability(): Promise<boolean>;
  readonly referringDevice?: BluetoothDevice;
}

interface Navigator {
  readonly bluetooth: Bluetooth;
}
```

## 3. Utilitas Bluetooth & ESC/POS Encoder

Buat file `src/lib/bluetooth.ts`. File ini menangani koneksi dan konversi teks ke perintah printer (ESC/POS).

```typescript
// UUID Standar untuk Printer Thermal Bluetooth
const PRINT_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINT_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

class EscPosEncoder {
  private encoder = new TextEncoder();
  private buffer: Uint8Array[] = [];

  // Inisialisasi Printer
  initialize() {
    this.buffer.push(new Uint8Array([0x1B, 0x40]));
    return this;
  }

  // Perataan Teks (0: Kiri, 1: Tengah, 2: Kanan)
  align(value: number) {
    this.buffer.push(new Uint8Array([0x1B, 0x61, value]));
    return this;
  }

  // Teks Tebal (1: Aktif, 0: Mati)
  bold(value: boolean) {
    this.buffer.push(new Uint8Array([0x1B, 0x45, value ? 1 : 0]));
    return this;
  }

  // Tambah Teks
  text(content: string) {
    this.buffer.push(this.encoder.encode(content));
    return this;
  }

  // Baris Baru
  line(content: string = '') {
    this.text(content + '\n');
    return this;
  }

  // Garis Pemisah (58mm biasanya 32 karakter)
  separator() {
    this.line('-'.repeat(32));
    return this;
  }

  // Potong Kertas / Feed
  feed(lines: number = 3) {
    this.buffer.push(new Uint8Array([0x1B, 0x64, lines]));
    return this;
  }

  // Ambil Data Byte
  encode() {
    const totalLength = this.buffer.reduce((acc, curr) => acc + curr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.buffer) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

let cachedDevice: BluetoothDevice | null = null;

// Fungsi untuk mendapatkan daftar printer yang sudah diizinkan di browser
export async function getPairedDevices() {
  if (navigator.bluetooth && navigator.bluetooth.getDevices) {
    return await navigator.bluetooth.getDevices();
  }
  return [];
}

// Fungsi untuk meminta izin printer baru
export async function requestNewDevice() {
  return await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [PRINT_SERVICE_UUID]
  });
}

// Fungsi Utama Cetak
export async function printReceipt(transaction: any, deviceToUse?: BluetoothDevice, storeName: string = 'TOKO') {
  if (!navigator.bluetooth) throw new Error('Bluetooth tidak didukung');

  try {
    let device = deviceToUse || cachedDevice;

    // Cari otomatis jika tidak ada input
    if (!device && navigator.bluetooth.getDevices) {
      const paired = await navigator.bluetooth.getDevices();
      device = paired.find(d => /printer|mtp|pos|thermal/i.test(d.name || ''));
    }

    if (!device) device = await requestNewDevice();
    cachedDevice = device;

    const server = await device.gatt?.connect();
    const service = await server?.getPrimaryService(PRINT_SERVICE_UUID);
    const characteristic = await service?.getCharacteristic(PRINT_CHARACTERISTIC_UUID);

    const encoder = new EscPosEncoder();
    encoder.initialize()
      .align(1).bold(true).line(storeName).bold(false)
      .align(0).separator()
      .line(`ID: ${transaction.id}`)
      .line(new Date(transaction.date).toLocaleString())
      .separator();

    transaction.items.forEach((item: any) => {
      encoder.line(item.name);
      encoder.line(`${item.quantity} x ${item.price.toLocaleString()} = ${(item.quantity * item.price).toLocaleString()}`);
    });

    encoder.separator()
      .align(2).bold(true).line(`TOTAL: Rp ${transaction.total.toLocaleString()}`).bold(false)
      .align(1).feed(3);

    const data = encoder.encode();
    
    // Kirim data dalam potongan (chunk) karena Bluetooth memiliki limit MTU (biasanya 20-512 byte)
    const chunkSize = 20;
    for (let i = 0; i < data.length; i += chunkSize) {
      await characteristic?.writeValue(data.slice(i, i + chunkSize));
    }

    await server?.disconnect();
  } catch (error) {
    console.error(error);
    throw error;
  }
}
```

## 4. Contoh Penggunaan di React

```tsx
import { useState } from 'react';
import { printReceipt, getPairedDevices } from './lib/bluetooth';

function PrintButton({ transaction }) {
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    setLoading(true);
    try {
      await printReceipt(transaction, undefined, "NAMA TOKO ANDA");
      alert("Berhasil mencetak!");
    } catch (err) {
      alert("Gagal: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handlePrint} disabled={loading}>
      {loading ? "Mencetak..." : "Cetak Struk"}
    </button>
  );
}
```

## 5. Tips Implementasi
- **HTTPS**: Web Bluetooth hanya bekerja di lingkungan HTTPS (atau localhost).
- **User Interaction**: `requestDevice()` harus dipicu oleh klik tombol user, tidak bisa otomatis saat halaman dimuat.
- **Chunking**: Selalu kirim data dalam potongan kecil (misal 20 byte) untuk menghindari error `GATT operation failed`.
- **58mm Width**: Printer thermal 58mm biasanya memiliki lebar 32 karakter standar. Sesuaikan perataan teks Anda.
