/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Minus, 
  Trash2, 
  ShoppingCart, 
  History, 
  Package, 
  Search, 
  Printer, 
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  X,
  Settings,
  Bluetooth
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, CartItem, Transaction } from './types';
import { printReceipt, getPairedDevices, requestNewDevice } from './lib/bluetooth';

const STORE_NAME = "TOKO PINTAR";

export default function App() {
  const [activeTab, setActiveTab] = useState<'pos' | 'products' | 'history'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [pairedDevices, setPairedDevices] = useState<BluetoothDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
  const [cashAmount, setCashAmount] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Gabungkan perangkat yang sudah di-pair dengan perangkat yang sedang terpilih
  const allDevices = useMemo(() => {
    const list = [...pairedDevices];
    if (selectedDevice && !list.find(d => d.id === selectedDevice.id)) {
      list.unshift(selectedDevice);
    }
    return list;
  }, [pairedDevices, selectedDevice]);

  // Load data from localStorage
  useEffect(() => {
    const savedProducts = localStorage.getItem('tp_products');
    const savedTransactions = localStorage.getItem('tp_transactions');
    
    if (savedProducts) setProducts(JSON.parse(savedProducts));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
    
    // Initial products if empty
    if (!savedProducts) {
      const initialProducts: Product[] = [
        { id: '1', name: 'Kopi Susu', price: 15000, category: 'Minuman' },
        { id: '2', name: 'Roti Bakar', price: 12000, category: 'Makanan' },
        { id: '3', name: 'Teh Manis', price: 5000, category: 'Minuman' },
      ];
      setProducts(initialProducts);
      localStorage.setItem('tp_products', JSON.stringify(initialProducts));
    }

    // Load paired devices
    refreshPairedDevices();
  }, []);

  const refreshPairedDevices = async () => {
    try {
      const devices = await getPairedDevices();
      setPairedDevices(devices);
      // Auto select if only one
      if (devices.length === 1 && !selectedDevice) {
        setSelectedDevice(devices[0]);
      }
    } catch (e) {
      console.error('Failed to get paired devices', e);
    }
  };

  const handlePairNew = async () => {
    try {
      const device = await requestNewDevice();
      setSelectedDevice(device);
      refreshPairedDevices();
      showStatus('success', `Berhasil menghubungkan ${device.name}`);
    } catch (error: any) {
      if (!error.message.includes('cancelled')) {
        showStatus('error', error.message);
      }
    }
  };

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('tp_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('tp_transactions', JSON.stringify(transactions));
  }, [transactions]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [products, searchQuery]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setIsPaymentModalOpen(true);
  };

  const completeTransaction = async () => {
    const cash = parseFloat(cashAmount);
    if (isNaN(cash) || cash < cartTotal) {
      showStatus('error', 'Uang tunai tidak cukup');
      return;
    }

    const transaction: Transaction = {
      id: Date.now().toString(),
      items: [...cart],
      total: cartTotal,
      date: new Date().toISOString(),
      cash: cash,
      change: cash - cartTotal,
      paymentMethod: 'cash'
    };

    setTransactions(prev => [transaction, ...prev]);
    setCart([]);
    setIsPaymentModalOpen(false);
    setCashAmount('');
    showStatus('success', 'Transaksi Berhasil!');
  };

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handlePrint = async (transaction: Transaction) => {
    // Jika belum ada device terpilih, buka modal pemilihan
    if (!selectedDevice && pairedDevices.length > 0) {
      setIsPrinterModalOpen(true);
      return;
    }

    try {
      showStatus('success', 'Menghubungkan ke printer...');
      await printReceipt(transaction, selectedDevice || undefined, STORE_NAME);
      showStatus('success', 'Struk dicetak!');
    } catch (error: any) {
      if (error.message === 'Pencarian printer dibatalkan.') {
        setStatusMessage(null);
        return;
      }
      showStatus('error', error.message || 'Gagal mencetak');
    }
  };

  const addProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const price = parseFloat(formData.get('price') as string);
    const category = formData.get('category') as string;

    if (!name || isNaN(price)) return;

    const newProduct: Product = {
      id: Date.now().toString(),
      name,
      price,
      category
    };

    setProducts(prev => [...prev, newProduct]);
    e.currentTarget.reset();
    showStatus('success', 'Produk ditambahkan');
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    showStatus('success', 'Produk dihapus');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center font-sans">
      {/* Mobile Container */}
      <div className="w-full max-w-[448px] bg-white min-h-screen shadow-xl flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <header className="bg-indigo-600 text-white p-4 sticky top-0 z-20 shadow-md">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold tracking-tight">{STORE_NAME}</h1>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  refreshPairedDevices();
                  setIsPrinterModalOpen(true);
                }}
                className={`p-2 rounded-full transition-colors ${selectedDevice ? 'bg-indigo-500' : 'hover:bg-indigo-700'}`}
                title="Pengaturan Printer"
              >
                <Bluetooth size={20} className={selectedDevice ? 'text-white' : 'text-indigo-200'} />
              </button>
              {activeTab === 'pos' && cart.length > 0 && (
                <button 
                  onClick={() => setCart([])}
                  className="p-2 hover:bg-indigo-700 rounded-full transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-24">
          <AnimatePresence mode="wait">
            {activeTab === 'pos' && (
              <motion.div 
                key="pos"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-4"
              >
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text"
                    placeholder="Cari produk..."
                    className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Product List */}
                <div className="grid grid-cols-2 gap-3">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="bg-white border border-gray-100 p-3 rounded-2xl shadow-sm hover:shadow-md active:scale-95 transition-all text-left flex flex-col justify-between h-32"
                    >
                      <div>
                        <span className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">{product.category}</span>
                        <h3 className="font-bold text-gray-800 line-clamp-2 mt-1">{product.name}</h3>
                      </div>
                      <p className="text-indigo-600 font-bold">Rp {product.price.toLocaleString()}</p>
                    </button>
                  ))}
                </div>

                {filteredProducts.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <Package size={48} className="mx-auto mb-2 opacity-20" />
                    <p>Produk tidak ditemukan</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'products' && (
              <motion.div 
                key="products"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-6"
              >
                <div className="bg-indigo-50 p-4 rounded-2xl">
                  <h2 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
                    <Plus size={20} /> Tambah Produk Baru
                  </h2>
                  <form onSubmit={addProduct} className="space-y-3">
                    <input name="name" placeholder="Nama Produk" className="w-full p-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500" required />
                    <input name="price" type="number" placeholder="Harga" className="w-full p-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500" required />
                    <select name="category" className="w-full p-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option>Makanan</option>
                      <option>Minuman</option>
                      <option>Lainnya</option>
                    </select>
                    <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors">
                      Simpan Produk
                    </button>
                  </form>
                </div>

                <div className="space-y-3">
                  <h2 className="font-bold text-gray-800 px-1">Daftar Produk ({products.length})</h2>
                  {products.map(product => (
                    <div key={product.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                      <div>
                        <h3 className="font-bold text-gray-800">{product.name}</h3>
                        <p className="text-sm text-gray-500">Rp {product.price.toLocaleString()} • {product.category}</p>
                      </div>
                      <button 
                        onClick={() => deleteProduct(product.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-4"
              >
                <h2 className="font-bold text-gray-800 px-1">Riwayat Transaksi</h2>
                {transactions.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <History size={48} className="mx-auto mb-2 opacity-20" />
                    <p>Belum ada transaksi</p>
                  </div>
                ) : (
                  transactions.map(tx => (
                    <div key={tx.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs text-gray-400 font-mono">{tx.id}</p>
                          <p className="text-sm font-medium text-gray-600">{new Date(tx.date).toLocaleString()}</p>
                        </div>
                        <p className="font-bold text-indigo-600">Rp {tx.total.toLocaleString()}</p>
                      </div>
                      <div className="text-xs text-gray-500 border-t border-dashed pt-2">
                        {tx.items.map(item => (
                          <div key={item.id} className="flex justify-between">
                            <span>{item.quantity}x {item.name}</span>
                            <span>Rp {(item.quantity * item.price).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => handlePrint(tx)}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors text-sm font-bold"
                      >
                        <Printer size={16} /> Cetak Struk
                      </button>
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Floating Cart Summary (Only in POS) */}
        {activeTab === 'pos' && cart.length > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-[416px] px-4 z-30"
          >
            <div className="bg-indigo-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-700 p-2 rounded-lg relative">
                  <ShoppingCart size={20} />
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-indigo-900">
                    {cart.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">Total Belanja</p>
                  <p className="font-bold text-lg leading-tight">Rp {cartTotal.toLocaleString()}</p>
                </div>
              </div>
              <button 
                onClick={handleCheckout}
                className="bg-white text-indigo-900 font-bold px-6 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors flex items-center gap-2"
              >
                Bayar <ChevronRight size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Bottom Navigation */}
        <nav className="bg-white border-t border-gray-100 p-2 flex justify-around items-center sticky bottom-0 z-40">
          <NavButton active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} icon={<ShoppingCart size={20} />} label="Kasir" />
          <NavButton active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={<Package size={20} />} label="Produk" />
          <NavButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={20} />} label="Riwayat" />
        </nav>

        {/* Printer Selection Modal */}
        <AnimatePresence>
          {isPrinterModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-[380px] rounded-3xl p-6 space-y-6 shadow-2xl"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-800">Pilih Printer</h2>
                  <button onClick={() => setIsPrinterModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button>
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-gray-500">Pilih printer yang sudah terhubung atau tambahkan baru.</p>
                  
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {allDevices.length > 0 ? (
                      allDevices.map(device => (
                        <button
                          key={device.id}
                          onClick={() => {
                            setSelectedDevice(device);
                            setIsPrinterModalOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                            selectedDevice?.id === device.id 
                            ? 'border-indigo-600 bg-indigo-50' 
                            : 'border-gray-100 hover:border-indigo-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Bluetooth size={20} className={selectedDevice?.id === device.id ? 'text-indigo-600' : 'text-gray-400'} />
                            <span className="font-bold text-gray-700">{device.name || 'Printer Tanpa Nama'}</span>
                          </div>
                          {selectedDevice?.id === device.id && <CheckCircle2 size={20} className="text-indigo-600" />}
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-6 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                        <p className="text-sm text-gray-400">Belum ada printer yang diizinkan.</p>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={handlePairNew}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    <Plus size={20} /> Pair Printer Baru
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Payment Modal */}
        <AnimatePresence>
          {isPaymentModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4"
            >
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="bg-white w-full max-w-[416px] rounded-t-3xl p-6 space-y-6 shadow-2xl"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-800">Pembayaran</h2>
                  <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-indigo-50 rounded-2xl">
                    <span className="text-indigo-900 font-medium">Total Tagihan</span>
                    <span className="text-2xl font-black text-indigo-900">Rp {cartTotal.toLocaleString()}</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">Uang Tunai</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">Rp</span>
                      <input 
                        type="number"
                        autoFocus
                        className="w-full pl-12 pr-4 py-4 bg-gray-100 rounded-2xl text-xl font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="0"
                        value={cashAmount}
                        onChange={(e) => setCashAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  {parseFloat(cashAmount) >= cartTotal && (
                    <div className="flex justify-between items-center p-4 bg-green-50 rounded-2xl border border-green-100">
                      <span className="text-green-800 font-medium">Kembalian</span>
                      <span className="text-xl font-black text-green-800">Rp {(parseFloat(cashAmount) - cartTotal).toLocaleString()}</span>
                    </div>
                  )}

                  <button 
                    onClick={completeTransaction}
                    disabled={!cashAmount || parseFloat(cashAmount) < cartTotal}
                    className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200"
                  >
                    Selesaikan Transaksi
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Toast */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 20 }}
              exit={{ opacity: 0, y: -50 }}
              className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] w-full max-w-[380px] px-4"
            >
              <div className={`p-4 rounded-2xl shadow-xl flex items-center gap-3 ${
                statusMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
              }`}>
                {statusMessage.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                <p className="font-bold">{statusMessage.text}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 transition-all ${active ? 'text-indigo-600' : 'text-gray-400'}`}
    >
      <div className={`p-2 rounded-xl transition-all ${active ? 'bg-indigo-50' : 'bg-transparent'}`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}
