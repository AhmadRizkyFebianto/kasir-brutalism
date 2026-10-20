"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, BriefcaseBusiness, CalendarDays, Check, ChevronDown, CircleHelp,
  Clock3, Coffee, Command, CreditCard, LayoutGrid, LockKeyhole, Minus, Plus,
  Printer, Search, ShoppingBag, Sparkles, Trash2, Utensils, X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { LoginForm } from "./login-form";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";

type Product = { id: string; name: string; category: string; price: number; stock?: number; kind: "product" | "space"; image: string; tag: string; };
type CartLine = { product: Product; qty: number };

const products: Product[] = [
  { id: "demo-1", name: "Kopi Susu Gula Aren Hub", category: "Kopi • Dingin", price: 22000, stock: 48, kind: "product", image: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=700&q=85", tag: "BESTSELLER" },
  { id: "demo-2", name: "Filter V60 Flores Bajawa", category: "Single Origin • V60", price: 35000, stock: 12, kind: "product", image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=700&q=85", tag: "" },
  { id: "demo-3", name: "Private Focus Pod 02", category: "Sewa per jam • Spot #POD-02", price: 50000, kind: "space", image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=700&q=85", tag: "TERSEDIA" },
  { id: "demo-4", name: "VIP Creative Room A", category: "Hingga 15:30 • Reservasi", price: 150000, kind: "space", image: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=700&q=85", tag: "TERPAKAI" },
  { id: "demo-5", name: "Truffle Cheese Croissant", category: "Bakery • Fresh Oven", price: 38000, stock: 8, kind: "product", image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=700&q=85", tag: "" },
  { id: "demo-6", name: "Kyoto Uji Matcha Latte", category: "Non-coffee • Oat Milk", price: 39000, stock: 24, kind: "product", image: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=700&q=85", tag: "" },
  { id: "demo-7", name: "Es Kopi Pandan", category: "Kopi • Dingin", price: 27000, stock: 18, kind: "product", image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=700&q=85", tag: "BARU" },
  { id: "demo-8", name: "Banana Bread", category: "Snack • Pastry", price: 28000, stock: 10, kind: "product", image: "https://images.unsplash.com/photo-1606101273945-e9eba6fad8f7?auto=format&fit=crop&w=700&q=85", tag: "" },
];

const money = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const categories = ["Semua Menu & Space", "Kopi Nusantara", "Non-Kopi & Teh", "Makanan Berat", "Snack & Pastry", "Sewa Ruang / Space"];

export default function Home() {
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [storeName, setStoreName] = useState("KOPI & SPACE");
  const [category, setCategory] = useState(categories[0]);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<Product[]>(isSupabaseConfigured ? [] : products);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeFilter, setActiveFilter] = useState("Semua");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let current = true;

    async function loadCatalog(authUser: User) {
      setCatalogLoading(true);
      const configuredStore = process.env.NEXT_PUBLIC_POS_STORE_ID;
      let storeId = configuredStore;
      if (!storeId) {
        const { data: membership, error: membershipError } = await supabase
          .from("store_members").select("store_id").eq("user_id", authUser.id).limit(1).maybeSingle();
        if (membershipError || !membership) {
          if (current) { setCatalog([]); setNotice("Akun ini belum diberi akses ke gerai. Minta owner menambahkan keanggotaan kasir."); setCatalogLoading(false); }
          return;
        }
        storeId = membership.store_id;
      }
      const [{ data: store }, { data, error }] = await Promise.all([
        supabase.from("stores").select("name").eq("id", storeId).maybeSingle(),
        supabase.from("products").select("id,name,category,kind,price,stock,image_url,tag").eq("store_id", storeId).eq("is_active", true).order("name"),
      ]);
      if (!current) return;
      if (error) setNotice(`Katalog gagal dimuat: ${error.message}`);
      else {
        setCatalog((data ?? []).map((row) => ({ id: row.id, name: row.name, category: row.category, price: row.price, stock: row.stock ?? undefined, kind: row.kind === "space" ? "space" : "product", image: row.image_url ?? "", tag: row.tag ?? "" })));
        setStoreName(store?.name.toLocaleUpperCase("id-ID") ?? "KOPI & SPACE");
      }
      setCatalogLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!current) return;
      const activeUser = data.session?.user ?? null;
      setUser(activeUser);
      setAuthLoading(false);
      if (activeUser) void loadCatalog(activeUser);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!current) return;
      const activeUser = session?.user ?? null;
      setUser(activeUser);
      if (!activeUser) { setCatalog([]); setCart([]); setAuthLoading(false); }
      else window.setTimeout(() => { if (current) void loadCatalog(activeUser); }, 0);
    });
    return () => { current = false; subscription.unsubscribe(); };
  }, []);

  const filtered = useMemo(() => catalog.filter((p) => {
    const matchesQuery = p.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === categories[0] || (category.includes("Space") ? p.kind === "space" : p.kind === "product");
    const matchesFilter = activeFilter === "Semua" || (activeFilter === "Kopi & Minuman" ? p.category.toLowerCase().includes("kopi") : activeFilter === "Makanan" ? p.category.toLowerCase().includes("pastry") : p.kind === "space");
    return matchesQuery && matchesCategory && matchesFilter;
  }), [catalog, query, category, activeFilter]);
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const tax = Math.round(subtotal * 0.1);
  const service = Math.round(subtotal * 0.05);
  const discount = Math.round(subtotal * 0.1);
  const total = subtotal + tax + service - discount;

  function add(product: Product) {
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      return found ? current.map((line) => line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line) : [...current, { product, qty: 1 }];
    });
  }
  function update(id: string, delta: number) {
    setCart((current) => current.map((line) => line.product.id === id ? { ...line, qty: line.qty + delta } : line).filter((line) => line.qty > 0));
  }

  if (isSupabaseConfigured && authLoading) return <main className="login-screen"><div className="login-card login-loading"><div className="login-icon"><LockKeyhole size={21} /></div><h1>Menyiapkan terminal…</h1><p>Memeriksa sesi kasir.</p></div></main>;
  if (isSupabaseConfigured && !user) return <main className="login-screen"><LoginForm onLogin={() => setNotice("Berhasil masuk.")} /></main>;
  function checkout() {
    setNotice("Pembayaran siap diproses — hubungkan kredensial Midtrans untuk menerima transaksi.");
    window.setTimeout(() => setNotice(""), 3500);
  }

  return (
    <main className="pos-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Command size={19} strokeWidth={3} /></div><span>{storeName}</span><div className="online-chip"><i />{isSupabaseConfigured ? "ONLINE: KASIR" : "MODE DEMO"}</div></div>
        <div className="top-actions"><div className="shift-chip"><Clock3 size={14} />Shift Aktif <b>—</b></div><button className="control-btn"><LockKeyhole size={15} />Tutup Shift</button><button className="icon-btn" aria-label="refresh"><Sparkles size={16} /></button><button className="icon-btn notification" aria-label="notifications"><Bell size={17} /></button>{user ? <button className="avatar" title={user.email ?? "Kasir"} onClick={async () => { await createSupabaseBrowserClient()?.auth.signOut(); }}>KS</button> : <button className="avatar">KS</button>}</div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <section className="store-summary"><div><b>{storeName}</b><small>{user?.email ?? "Terminal #01 - Kasir"}</small></div><span className="live-badge">{isSupabaseConfigured ? "LIVE" : "DEMO"}</span></section>
          <button className="new-table"><Plus size={17} />Buka Meja Baru</button>
          <section className="categories"><div className="section-label"><span>KATALOG &amp; AREA</span><span>[ESC]</span></div>
            {categories.map((name, i) => <button key={name} onClick={() => setCategory(name)} className={`category-item ${category === name ? "selected" : ""} ${i === 5 ? "space-category" : ""}`}><span className="category-icon">{i === 0 ? <LayoutGrid size={16} /> : i === 1 ? <Coffee size={16} /> : i === 2 ? <Utensils size={16} /> : i === 5 ? <BriefcaseBusiness size={16} /> : <ShoppingBag size={16} />}</span><span>{name}</span>{(i === 0 || i === 5) && <em>{i === 0 ? "18" : "4"}</em>}</button>)}
          </section>
          <section className="tables"><div className="section-label"><span>DENAH MEJA CEPAT</span><b>12/16 KOSONG</b></div><div className="table-grid">{[{ code: "T-04", desc: "Indoor (4p)", status: "Tersedia", tone: "green" }, { code: "VIP-A", desc: "Room (8p)", status: "Terisi", tone: "red" }, { code: "POD-2", desc: "Booth (2p)", status: "14:00", tone: "yellow" }, { code: "OUT-1", desc: "Garden (6p)", status: "Tersedia", tone: "green" }].map((table) => <button className="table-tile" key={table.code}><span className={`status-dot ${table.tone}`} /><b>{table.code}</b><small>{table.desc}</small><span className={`table-status ${table.tone}`}><i className={`status-dot ${table.tone}`} />{table.status}</span></button>)}</div></section>
          <button className="help-btn"><CircleHelp size={16} />Bantuan &amp; SOP<span>v2.4</span></button>
        </aside>

        <section className="catalog-area">
          <div className="catalog-toolbar"><div className="search-row"><kbd>[F3]</kbd><div className="search-box"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari menu, SKU kopi, atau kode meja..." /><button aria-label="search"><Search size={18} /></button></div></div><div className="quick-actions"><button><b>F1:</b> Order Baru</button><button className="quick-primary"><b>F2:</b> Bayar / Checkout</button><button><b>F4:</b> Tahan Bon</button></div></div>
          <div className="filter-bar"><span className="filter-title">TAMPILKAN:</span><div className="filter-buttons">{["Semua", "Kopi & Minuman", "Makanan", "Sewa Space"].map((item) => <button key={item} onClick={() => setActiveFilter(item)} className={activeFilter === item ? "active" : ""}>{item === "Kopi & Minuman" && <Coffee size={13} />}{item === "Makanan" && <Utensils size={13} />}{item}</button>)}</div><div className="legend"><span><i className="status-dot green" />Ready</span><span><i className="status-dot yellow" />Booked</span><span><i className="status-dot red" />Terpakai</span></div></div>
          <div className="product-scroll"><div className="product-grid">{catalogLoading && <div className="empty-state">Memuat katalog dari Supabase…</div>}{filtered.map((product, index) => <motion.article key={product.id} className={`product-card ${product.kind === "space" ? "space-card" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, duration: 0.24 }} layout>
              <div className="product-photo" style={product.image ? { backgroundImage: `url("${product.image}")` } : undefined}><span className={`stock-tag ${product.kind === "space" ? "room-tag" : ""}`}>{product.kind === "space" ? <><span>RUANGAN</span><i className={`status-dot ${product.tag === "TERSEDIA" ? "green" : "red"}`} />{product.tag || "SPACE"}</> : <>STOK: {product.stock ?? "∞"}</>}</span>{product.tag === "BESTSELLER" && <span className="best-tag">BESTSELLER</span>}{product.tag === "TERPAKAI" && <span className="occupied-tag">● SEDANG DIPAKAI</span>}</div>
              <div className="product-info"><span className={`product-category ${product.kind === "space" ? "blue-text" : ""}`}>{product.category}</span><h3>{product.name}</h3><div className="product-bottom"><span className="price">Rp {money(product.price)}{product.kind === "space" && <small>/jam</small>}</span><button className={product.kind === "space" ? "book-add" : "add-btn"} onClick={() => add(product)} aria-label={`Tambah ${product.name}`}>{product.kind === "space" ? <CalendarDays size={17} /> : <Plus size={20} />}</button></div></div>
            </motion.article>)}{filtered.length === 0 && <div className="empty-state">Menu tidak ditemukan. Coba kata kunci lain.</div>}</div></div>
        </section>

        <aside className="order-panel"><div className="order-heading"><h2><span>▤</span> PESANAN AKTIF</h2><button><i />DINING &amp; RESERVASI<ChevronDown size={12} /></button></div><button className="active-order"><span className="table-code">T-04</span><span className="order-name"><b>Table Indoor #04</b><small>RSV-20260730-01 • Arya (4 Pax)</small></span><span className="edit-order">✎</span></button>
          <div className="cart-list"><AnimatePresence initial={false}>{cart.map((line) => <motion.div className="cart-line" key={line.product.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><div className="line-heading"><b>{line.product.name}</b><button onClick={() => update(line.product.id, -line.qty)} aria-label="hapus item"><Trash2 size={15} /></button></div>{line.product.kind === "space" && <small className="space-rental">Durasi: {line.qty} jam (13:00 - 15:00)</small>}<div className="line-bottom"><div className="qty-stepper"><button onClick={() => update(line.product.id, -1)} aria-label="kurangi"><Minus size={13} /></button><span>{line.qty}</span><button onClick={() => update(line.product.id, 1)} aria-label="tambah"><Plus size={13} /></button></div><b>Rp {money(line.product.price * line.qty)}</b></div></motion.div>)}</AnimatePresence>{cart.length === 0 && <div className="empty-cart">Bon masih kosong.<br />Pilih menu untuk mulai.</div>}</div>
          <div className="payment-summary"><div><span>Subtotal ({cart.length} Item):</span><b>Rp {money(subtotal)}</b></div><div><span>Pajak Resto (PB1 10%):</span><b>Rp {money(tax)}</b></div><div><span>Biaya Layanan (Service 5%):</span><b>Rp {money(service)}</b></div><div className="discount-row"><span>Diskon Member Space Hub:</span><b>- Rp {money(discount)}</b></div><div className="grand-total"><span><small>TOTAL TAGIHAN BERSIH</small><b>IDR</b></span><strong><em>TAGIHAN RESMI</em>{money(total)}</strong></div><button className="pay-button" onClick={checkout}><CreditCard size={19} /> BAYAR CEPAT [F2] (QRIS / KAS)</button><div className="receipt-actions"><button><BriefcaseBusiness size={14} />Pisah Tagihan</button><button><Printer size={14} />Cetak Struk Bon</button></div></div>
        </aside>
      </div>
      <AnimatePresence>{notice && <motion.div className="toast" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}><Check size={17} />{notice}<button onClick={() => setNotice("")}><X size={15} /></button></motion.div>}</AnimatePresence>
    </main>
  );
}
