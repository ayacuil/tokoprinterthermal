/**
 * ESC/POS Command Encoder for 58mm Thermal Printers
 */

const ESC = 0x1b;
const GS = 0x1d;

export class EscPosEncoder {
  private buffer: number[] = [];

  initialize() {
    this.buffer.push(ESC, 0x40);
    return this;
  }

  alignCenter() {
    this.buffer.push(ESC, 0x61, 1);
    return this;
  }

  alignLeft() {
    this.buffer.push(ESC, 0x61, 0);
    return this;
  }

  alignRight() {
    this.buffer.push(ESC, 0x61, 2);
    return this;
  }

  bold(enabled: boolean) {
    this.buffer.push(ESC, 0x45, enabled ? 1 : 0);
    return this;
  }

  text(content: string) {
    const bytes = new TextEncoder().encode(content);
    this.buffer.push(...Array.from(bytes));
    return this;
  }

  line(content: string = '') {
    this.text(content + '\n');
    return this;
  }

  newline() {
    this.buffer.push(0x0a);
    return this;
  }

  separator() {
    this.line('--------------------------------');
    return this;
  }

  feed(lines: number = 3) {
    this.buffer.push(ESC, 0x64, lines);
    return this;
  }

  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

const PRINT_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINT_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

let cachedDevice: BluetoothDevice | null = null;

export async function printReceipt(transaction: any, storeName: string = 'TOKO PINTAR') {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth tidak didukung di browser ini.');
  }

  try {
    let device: BluetoothDevice | undefined;

    // 1. Cek apakah ada device yang sudah terhubung/tersimpan di memori aplikasi (Sesi ini)
    if (cachedDevice) {
      device = cachedDevice;
      console.log('Menggunakan printer dari cache sesi:', device.name);
    }

    // 2. Jika tidak ada di cache, cari dari daftar perangkat yang sudah pernah diberi izin (Paired di browser)
    if (!device && navigator.bluetooth.getDevices) {
      const pairedDevices = await navigator.bluetooth.getDevices();
      console.log('Mengecek perangkat yang sudah paired di browser:', pairedDevices.length);
      
      device = pairedDevices.find(d => 
        /printer|mtp|pos|thermal|58mm/i.test(d.name || '')
      );

      if (device) {
        console.log('Menggunakan printer yang ditemukan dari izin browser:', device.name);
      }
    }

    // 3. Hanya jika benar-benar tidak ada, minta izin baru (Pop-up muncul)
    if (!device) {
      console.log('Tidak ada printer tersimpan, membuka jendela pemilihan...');
      device = await navigator.bluetooth.requestDevice({
        // Gunakan filter agar hanya printer yang muncul (menyembunyikan jam/tablet)
        filters: [
          { services: [PRINT_SERVICE_UUID] },
          { namePrefix: 'Printer' },
          { namePrefix: 'MTP' },
          { namePrefix: 'POS' },
          { namePrefix: 'BT' }
        ],
        optionalServices: [PRINT_SERVICE_UUID]
      });
    }

    // Simpan ke cache agar tidak perlu pair lagi selama aplikasi tidak di-refresh
    cachedDevice = device;

    const server = await device.gatt?.connect();
    if (!server) throw new Error('Gagal terhubung ke printer.');

    const service = await server.getPrimaryService(PRINT_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(PRINT_CHARACTERISTIC_UUID);

    const encoder = new EscPosEncoder();
    encoder.initialize()
      .alignCenter()
      .bold(true)
      .line(storeName.toUpperCase())
      .bold(false)
      .line('Terima Kasih Telah Belanja')
      .separator()
      .alignLeft();

    transaction.items.forEach((item: any) => {
      encoder.line(item.name);
      const priceStr = `${item.quantity} x ${item.price.toLocaleString()}`;
      const subtotal = (item.quantity * item.price).toLocaleString();
      // Simple padding for 32 chars (58mm standard)
      const padding = 32 - priceStr.length - subtotal.length;
      encoder.line(priceStr + ' '.repeat(Math.max(1, padding)) + subtotal);
    });

    encoder.separator()
      .alignRight()
      .line(`TOTAL: ${transaction.total.toLocaleString()}`)
      .line(`TUNAI: ${transaction.cash.toLocaleString()}`)
      .line(`KEMBALI: ${transaction.change.toLocaleString()}`)
      .newline()
      .alignCenter()
      .line(new Date(transaction.date).toLocaleString())
      .feed(4);

    const data = encoder.encode();
    
    // Split data into chunks if necessary (some printers have small buffers)
    const CHUNK_SIZE = 20;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      await characteristic.writeValue(chunk);
    }

    await server.disconnect();
  } catch (error: any) {
    console.error('Bluetooth Print Error:', error);
    
    const message = error.message || '';
    
    if (error.name === 'NotFoundError' || message.includes('cancelled')) {
      throw new Error('Pencarian printer dibatalkan.');
    }
    
    if (error.name === 'SecurityError') {
      throw new Error('Izin Bluetooth ditolak oleh browser.');
    }
    
    if (error.name === 'AbortError') {
      throw new Error('Koneksi ke printer terputus.');
    }

    if (message.includes('Bluetooth adapter not available')) {
      throw new Error('Bluetooth tidak aktif di perangkat Anda.');
    }

    throw new Error(message || 'Gagal mencetak struk.');
  }
}
