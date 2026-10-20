"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote, Bell, BriefcaseBusiness, CalendarDays, Check, ChevronDown, CircleHelp,
  Clock3, Coffee, Command, CreditCard, FileBarChart, History, LayoutGrid, LockKeyhole, Minus, Plus,
  Printer, Save, Search, Settings, ShoppingBag, Sparkles, Trash2, Utensils, X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { LoginForm } from "./login-form";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";

type Product = { id: string; name: string; sku?: string; category: string; price: number; stock?: number; kind: "product" | "space"; image: string; tag: string; };
type CartLine = { product: Product; qty: number };
type SavedOrder = { id: string; code: string; subtotal: number; discount: number; tax: number; service: number; total: number; signature: string; status?: string; tableCode?: string | null };
type PricingRates = { tax: number; service: number; discount: number };
type StoreTable = { code: string; desc: string; area: string; capacity: number; status: "available" | "occupied" | "closed" };
type SpaceRecord = { id: string; productId: string; code: string; capacity: number };
type SpaceReservation = { id: string; spaceId: string; productId: string; startsAt: string; endsAt: string; guestCount: number; customerName?: string; orderId?: string; holdExpiresAt?: string };
type CashierShift = { id: string; opened_at: string; opening_cash: number; status: "open" | "closed" };
type CatalogDraft = { id: string; sku: string; name: string; category: string; price: string; stock: string; image_url: string; tag: string };
type ReportPayment = { id: string; order_id: string; amount: number; payment_type: string | null; paid_at: string | null; };
type ReceiptLine = { name: string; quantity: number; unitPrice: number; lineTotal: number };
type ReceiptData = { code: string; storeName: string; paidAt: string; method: string; tableCode: string | null; subtotal: number; discount: number; tax: number; service: number; total: number; lines: ReceiptLine[] };
type HistoryEntry = { paymentId: string; orderId: string; code: string; tableCode: string | null; orderStatus: string; paymentStatus: string; amount: number; paymentType: string | null; paidAt: string | null; createdAt: string };

const products: Product[] = [
  { id: "demo-1", name: "Kopi Susu Gula Aren Hub", sku: "KOPI-AREN", category: "Kopi • Dingin", price: 22000, stock: 48, kind: "product", image: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=700&q=85", tag: "BESTSELLER" },
  { id: "demo-2", name: "Filter V60 Flores Bajawa", sku: "V60-FLORES", category: "Single Origin • V60", price: 35000, stock: 12, kind: "product", image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=700&q=85", tag: "" },
  { id: "demo-3", name: "Private Focus Pod 02", sku: "POD-02", category: "Sewa per jam • Spot #POD-02", price: 50000, kind: "space", image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=700&q=85", tag: "TERSEDIA" },
  { id: "demo-4", name: "VIP Creative Room A", sku: "VIP-ROOM-A", category: "Hingga 15:30 • Reservasi", price: 150000, kind: "space", image: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=700&q=85", tag: "TERPAKAI" },
  { id: "demo-5", name: "Truffle Cheese Croissant", category: "Bakery • Fresh Oven", price: 38000, stock: 8, kind: "product", image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=700&q=85", tag: "" },
  { id: "demo-6", name: "Kyoto Uji Matcha Latte", category: "Non-coffee • Oat Milk", price: 39000, stock: 24, kind: "product", image: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=700&q=85", tag: "" },
  { id: "demo-7", name: "Es Kopi Pandan", category: "Kopi • Dingin", price: 27000, stock: 18, kind: "product", image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=700&q=85", tag: "BARU" },
  { id: "demo-8", name: "Banana Bread", category: "Snack • Pastry", price: 28000, stock: 10, kind: "product", image: "https://images.unsplash.com/photo-1606101273945-e9eba6fad8f7?auto=format&fit=crop&w=700&q=85", tag: "" },
];

const money = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const categories = ["Semua Menu & Space", "Kopi Nusantara", "Non-Kopi & Teh", "Makanan Berat", "Snack & Pastry", "Sewa Ruang / Space"];
const normalizeCatalogText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function matchesRailCategory(product: Product, selectedCategory: string) {
  const text = normalizeCatalogText(`${product.category} ${product.name} ${product.sku ?? ""}`);
  if (selectedCategory === categories[0]) return true;
  if (selectedCategory === "Sewa Ruang / Space") return product.kind === "space";
  if (product.kind === "space") return false;
  if (selectedCategory === "Kopi Nusantara") return /kopi|coffee|v60|single origin/.test(text) && !/non[ -]coffee|non[ -]kopi/.test(text);
  if (selectedCategory === "Non-Kopi & Teh") return /non[ -]coffee|non[ -]kopi|matcha|teh|tea/.test(text);
  if (selectedCategory === "Makanan Berat") return /makanan berat|makanan utama|main course|heavy meal/.test(text);
  if (selectedCategory === "Snack & Pastry") return /snack|pastry|bakery|croissant|roti|bread/.test(text);
  return true;
}
function matchesQuickFilter(product: Product, selectedFilter: string) {
  if (selectedFilter === "Semua") return true;
  if (selectedFilter === "Sewa Space") return product.kind === "space";
  if (product.kind === "space") return false;
  const text = normalizeCatalogText(`${product.category} ${product.name} ${product.sku ?? ""}`);
  if (selectedFilter === "Kopi & Minuman") return /kopi|coffee|v60|single origin|matcha|teh|tea|minuman/.test(text);
  if (selectedFilter === "Makanan") return /makanan|food|meal|snack|pastry|bakery|croissant|roti|bread/.test(text);
  return true;
}
const signatureFor = (items: { product_id: string; quantity: number }[]) => JSON.stringify([...items].sort((a, b) => a.product_id.localeCompare(b.product_id)));
const demoTables: StoreTable[] = [
  { code: "T-04", desc: "Table Indoor #04", area: "Indoor", capacity: 4, status: "available" },
  { code: "VIP-A", desc: "VIP Room A", area: "Private Room", capacity: 8, status: "occupied" },
  { code: "POD-2", desc: "Focus Pod 02", area: "Booth", capacity: 2, status: "available" },
  { code: "OUT-1", desc: "Garden #01", area: "Garden", capacity: 6, status: "available" },
];

export default function Home() {
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [storeName, setStoreName] = useState("KOPI & SPACE");
  const [storeId, setStoreId] = useState("");
  const [rates, setRates] = useState<PricingRates>({ tax: 0, service: 0, discount: 0 });
  const [savedOrder, setSavedOrder] = useState<SavedOrder | null>(null);
  const [openOrders, setOpenOrders] = useState<SavedOrder[]>([]);
  const [orderMenuOpen, setOrderMenuOpen] = useState(false);
  const [tables, setTables] = useState<StoreTable[]>(isSupabaseConfigured ? [] : demoTables);
  const [spaces, setSpaces] = useState<SpaceRecord[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeReservation, setActiveReservation] = useState<SpaceReservation | null>(null);
  const [cashierShift, setCashierShift] = useState<CashierShift | null>(null);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState("0");
  const [countedCashInput, setCountedCashInput] = useState("");
  const [shiftBusy, setShiftBusy] = useState(false);
  const [memberRole, setMemberRole] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<"catalog" | "rates" | "report">("catalog");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [productDraft, setProductDraft] = useState<CatalogDraft>({ id: "", sku: "", name: "", category: "Kopi", price: "", stock: "", image_url: "", tag: "" });
  const [rateDraft, setRateDraft] = useState({ tax: "0", service: "0", discount: "0" });
  const [reportPayments, setReportPayments] = useState<ReportPayment[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [bookingProduct, setBookingProduct] = useState<Product | null>(null);
  const [bookingStart, setBookingStart] = useState("");
  const [bookingDuration, setBookingDuration] = useState(2);
  const [bookingGuestCount, setBookingGuestCount] = useState(1);
  const [bookingCustomerName, setBookingCustomerName] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<SavedOrder | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [snapUrl, setSnapUrl] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const requestId = useRef<string | null>(null);
  const requestSignature = useRef<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
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
      const client = createSupabaseBrowserClient();
      if (!client) return;
      setCatalogLoading(true);
      const configuredStore = process.env.NEXT_PUBLIC_POS_STORE_ID;
      let storeId = configuredStore;
      if (!storeId) {
        const { data: membership, error: membershipError } = await client
          .from("store_members").select("store_id,role").eq("user_id", authUser.id).limit(1).maybeSingle();
        if (membershipError || !membership) {
          if (current) { setCatalog([]); setNotice("Akun ini belum diberi akses ke gerai. Minta owner menambahkan keanggotaan kasir."); setCatalogLoading(false); }
          return;
        }
        storeId = membership.store_id;
        if (current) setMemberRole(membership.role);
      } else {
        const { data: member } = await client.from("store_members").select("role").eq("store_id", storeId).eq("user_id", authUser.id).maybeSingle();
        if (current) setMemberRole(member?.role ?? "");
      }
      if (!storeId) {
        if (current) { setNotice("Gerai untuk akun ini tidak ditemukan."); setCatalogLoading(false); }
        return;
      }
      if (current) setStoreId(storeId);
      const { data: activeShift } = await client.from("cashier_shifts").select("id,opened_at,opening_cash,status")
        .eq("store_id", storeId).eq("cashier_id", authUser.id).eq("status", "open").maybeSingle();
      if (current) setCashierShift(activeShift as CashierShift | null);
      const [{ data: store }, { data, error }, { data: settings, error: settingsError }, { data: spaces }, { data: tableData }, { data: reservations }] = await Promise.all([
        client.from("stores").select("name").eq("id", storeId).maybeSingle(),
        client.from("products").select("id,name,sku,category,kind,price,stock,image_url,tag").eq("store_id", storeId).eq("is_active", true).order("name"),
        client.from("store_settings").select("tax_rate_bps,service_rate_bps,discount_rate_bps").eq("store_id", storeId).maybeSingle(),
        client.from("store_spaces").select("id,product_id,code,capacity").eq("store_id", storeId).eq("is_active", true),
        client.from("store_tables").select("code,label,area,capacity,status").eq("store_id", storeId).eq("is_active", true).order("code"),
        client.from("space_reservations").select("space_id,status,starts_at,ends_at,hold_expires_at").eq("store_id", storeId).in("status", ["held", "reserved", "checked_in"]),
      ]);
      if (!current) return;
      if (error) setNotice(`Katalog gagal dimuat: ${error.message}`);
      else {
        const now = Date.now();
        const nextCatalog: Product[] = (data ?? []).map((row) => {
          const space = (spaces ?? []).find((entry) => entry.product_id === row.id);
          const bookings = (reservations ?? []).filter((entry) => entry.space_id === space?.id && new Date(entry.ends_at).getTime() > now && (entry.status !== "held" || new Date(entry.hold_expires_at).getTime() > now));
          const tag = row.kind === "space" ? bookings.some((entry) => new Date(entry.starts_at).getTime() <= now) ? "TERPAKAI" : bookings.length ? "BOOKED" : "TERSEDIA" : row.tag ?? "";
          return { id: row.id, name: row.name, sku: row.sku ?? undefined, category: row.category, price: row.price, stock: row.stock ?? undefined, kind: row.kind === "space" ? "space" : "product", image: row.image_url ?? "", tag };
        });
        setCatalog(nextCatalog);
        setStoreName(store?.name.toLocaleUpperCase("id-ID") ?? "KOPI & SPACE");
        setTables((tableData ?? []).map((table) => ({ code: table.code, desc: table.label, area: table.area, capacity: table.capacity, status: table.status === "occupied" || table.status === "closed" ? table.status : "available" })));
        setSpaces((spaces ?? []).map((space) => ({ id: space.id, productId: space.product_id, code: space.code, capacity: space.capacity })));
        if (settings) setRates({ tax: settings.tax_rate_bps, service: settings.service_rate_bps, discount: settings.discount_rate_bps });
        if (settingsError) setNotice(`Pengaturan biaya belum dimuat; total sementara memakai tarif nol: ${settingsError.message}`);
        const { data: orders } = await client.from("orders")
          .select("id,order_code,subtotal,discount_amount,tax_amount,service_amount,total_amount,status,table_code")
          .eq("store_id", storeId).eq("cashier_id", authUser.id).in("status", ["open", "pending_payment"])
          .order("created_at", { ascending: false }).limit(10);
        const savedOrders: SavedOrder[] = (orders ?? []).map((order) => ({ id: order.id, code: order.order_code, subtotal: order.subtotal, discount: order.discount_amount, tax: order.tax_amount, service: order.service_amount, total: order.total_amount, signature: "", status: order.status, tableCode: order.table_code }));
        if (current) setOpenOrders(savedOrders);
        const openOrder = orders?.[0];
        if (openOrder) {
          const { data: orderItems } = await client.from("order_items").select("product_id,quantity")
            .eq("store_id", storeId).eq("order_id", openOrder.id);
          const restoredCart: CartLine[] = (orderItems ?? []).flatMap((item) => {
            const product = nextCatalog.find((entry) => entry.id === item.product_id);
            return product ? [{ product, qty: item.quantity }] : [];
          });
          const signature = signatureFor(restoredCart.map(({ product, qty }) => ({ product_id: product.id, quantity: qty })));
          if (current && restoredCart.length === (orderItems ?? []).length && restoredCart.length) {
            setCart(restoredCart);
            setSavedOrder({ id: openOrder.id, code: openOrder.order_code, subtotal: openOrder.subtotal, discount: openOrder.discount_amount, tax: openOrder.tax_amount, service: openOrder.service_amount, total: openOrder.total_amount, signature, status: openOrder.status, tableCode: openOrder.table_code });
            setSelectedTable(openOrder.table_code);
            const { data: reservation } = await client.from("space_reservations").select("id,space_id,customer_name,guest_count,starts_at,ends_at,hold_expires_at")
              .eq("store_id", storeId).eq("order_id", openOrder.id).eq("status", "reserved").limit(1).maybeSingle();
            const reservedSpace = (spaces ?? []).find((space) => space.id === reservation?.space_id);
            if (reservation && reservedSpace) setActiveReservation({ id: reservation.id, spaceId: reservation.space_id, productId: reservedSpace.product_id, startsAt: reservation.starts_at, endsAt: reservation.ends_at, guestCount: reservation.guest_count, customerName: reservation.customer_name ?? undefined, orderId: openOrder.id, holdExpiresAt: reservation.hold_expires_at });
          } else if (current && (orderItems ?? []).length) {
            setNotice("Bon tersimpan berisi menu yang sedang tidak aktif. Pilih menu tersebut kembali atau hubungi admin.");
          }
        }
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
      if (!activeUser) { setCatalog([]); setCart([]); setSavedOrder(null); setOpenOrders([]); setSpaces([]); setTables([]); setActiveReservation(null); setSelectedTable(null); setCashierShift(null); setMemberRole(""); requestId.current = null; requestSignature.current = null; setAuthLoading(false); }
      else window.setTimeout(() => { if (current) void loadCatalog(activeUser); }, 0);
    });
    return () => { current = false; subscription.unsubscribe(); };
  }, []);

  const filtered = useMemo(() => catalog.filter((p) => {
    const normalizedQuery = query.trim().toLowerCase();
    const spaceCode = spaces.find((space) => space.productId === p.id)?.code ?? "";
    const matchesQuery = !normalizedQuery || [p.name, p.sku ?? "", p.category, spaceCode].some((value) => value.toLowerCase().includes(normalizedQuery));
    const matchesCategory = matchesRailCategory(p, category);
    const matchesFilter = matchesQuickFilter(p, activeFilter);
    return matchesQuery && matchesCategory && matchesFilter;
  }), [catalog, spaces, query, category, activeFilter]);
  const signature = signatureFor(cart.map(({ product, qty }) => ({ product_id: product.id, quantity: qty })));
  const savedCartCurrent = Boolean(savedOrder && savedOrder.signature === signature);
  const subtotal = savedCartCurrent ? savedOrder!.subtotal : cart.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const discount = savedCartCurrent ? savedOrder!.discount : Math.round(subtotal * rates.discount / 10000);
  const tax = savedCartCurrent ? savedOrder!.tax : Math.round((subtotal - discount) * rates.tax / 10000);
  const service = savedCartCurrent ? savedOrder!.service : Math.round((subtotal - discount) * rates.service / 10000);
  const total = savedCartCurrent ? savedOrder!.total : subtotal + tax + service - discount;

  function add(product: Product) {
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      return found ? current.map((line) => line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line) : [...current, { product, qty: 1 }];
    });
  }
  function update(id: string, delta: number) {
    setCart((current) => current.map((line) => line.product.id === id ? { ...line, qty: line.qty + delta } : line).filter((line) => line.qty > 0));
  }
  async function saveOrder(): Promise<SavedOrder | null> {
    if (cart.length === 0) { setNotice("Bon masih kosong. Tambahkan menu sebelum menyimpan."); return null; }
    if (savedOrder?.status === "pending_payment") { setNotice("Bon sedang menunggu pembayaran. Periksa status atau lanjutkan pembayaran sebelum mengubah item."); return null; }
    const spaceLines = cart.filter((line) => line.product.kind === "space");
    if (spaceLines.length > 1 || (spaceLines.length > 0 && (!activeReservation || activeReservation.productId !== spaceLines[0].product.id || (activeReservation.orderId && activeReservation.orderId !== savedOrder?.id)))) {
      setNotice("Buat reservasi space yang cocok sebelum menyimpan bon.");
      return null;
    }
    if (!isSupabaseConfigured || !user || !storeId) { setNotice("Hubungkan Supabase dan masuk ke gerai untuk menyimpan bon."); return null; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return null;
    setOrderBusy(true);
    const items = cart.map(({ product, qty }) => ({ product_id: product.id, quantity: qty }));
    const currentSignature = signatureFor(items);
    if (!savedOrder) {
      if (requestId.current && requestSignature.current !== currentSignature) requestId.current = null;
      requestId.current ??= crypto.randomUUID();
      requestSignature.current = currentSignature;
    }
    try {
      const response = savedOrder
        ? await supabase.rpc("update_pos_order_draft", { p_order_id: savedOrder.id, p_items: items })
        : await supabase.rpc("create_pos_order_draft", { p_store_id: storeId, p_request_id: requestId.current, p_items: items });
      if (response.error) { setNotice(`Bon gagal disimpan: ${response.error.message}`); return null; }
      const row = Array.isArray(response.data) ? response.data[0] : response.data;
      if (!row) { setNotice("Supabase tidak mengembalikan bon."); return null; }
      const nextOrder = { id: row.order_id, code: row.order_code, subtotal: row.subtotal, discount: row.discount_amount, tax: row.tax_amount, service: row.service_amount, total: row.total_amount, signature: signatureFor(items), tableCode: savedOrder?.tableCode ?? null, status: "open" };
      setSavedOrder(nextOrder);
      setOpenOrders((current) => [nextOrder, ...current.filter((item) => item.id !== nextOrder.id)].slice(0, 10));
      if (selectedTable) {
        const { error: tableError } = await supabase.rpc("assign_order_table", { p_order_id: nextOrder.id, p_table_code: selectedTable });
        if (tableError) { setNotice(`Bon tersimpan, tetapi meja belum terpasang: ${tableError.message}`); return null; }
        setTables((current) => current.map((table) => table.code === selectedTable ? { ...table, status: "occupied" } : table.code === savedOrder?.tableCode ? { ...table, status: "available" } : table));
        setSavedOrder((current) => current ? { ...current, tableCode: selectedTable } : current);
        setOpenOrders((current) => current.map((item) => item.id === nextOrder.id ? { ...item, tableCode: selectedTable } : item));
      }
      if (activeReservation && spaceLines.length > 0) {
        const { error: reservationError } = await supabase.rpc("attach_space_reservation", { p_order_id: nextOrder.id, p_reservation_id: activeReservation.id });
        if (reservationError) { setNotice(`Bon tersimpan, tetapi reservasi belum terpasang: ${reservationError.message}`); return null; }
        setActiveReservation((current) => current ? { ...current, orderId: nextOrder.id } : current);
      }
      setNotice(`Bon ${nextOrder.code} tersimpan.`);
      return nextOrder;
    } catch {
      setNotice("Bon belum dapat disimpan karena koneksi terputus.");
      return null;
    } finally { setOrderBusy(false); }
  }
  async function startNewOrder(defaultTable?: string) {
    if (activeReservation && !activeReservation.orderId) {
      const supabase = createSupabaseBrowserClient();
      if (supabase) await supabase.rpc("cancel_space_reservation", { p_reservation_id: activeReservation.id });
    }
    requestId.current = null;
    requestSignature.current = null;
    setSavedOrder(null);
    setCart([]);
    setActiveReservation(null);
    setSelectedTable(defaultTable ?? null);
    setNotice("Bon baru siap.");
  }
  async function selectOpenOrder(order: SavedOrder) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { data: items, error } = await supabase.from("order_items").select("product_id,quantity")
      .eq("store_id", storeId).eq("order_id", order.id);
    if (error) { setNotice(`Bon gagal dibuka: ${error.message}`); return; }
    const restored: CartLine[] = (items ?? []).flatMap((item) => {
      const product = catalog.find((entry) => entry.id === item.product_id);
      return product ? [{ product, qty: item.quantity }] : [];
    });
    if (!restored.length || restored.length !== (items ?? []).length) { setNotice("Ada menu pada bon ini yang tidak tersedia di katalog."); return; }
    const nextSignature = signatureFor(restored.map(({ product, qty }) => ({ product_id: product.id, quantity: qty })));
    setCart(restored);
    setSavedOrder({ ...order, signature: nextSignature });
    setSelectedTable(order.tableCode ?? null);
    const { data: reservation } = await supabase.from("space_reservations").select("id,space_id,customer_name,guest_count,starts_at,ends_at,hold_expires_at")
      .eq("store_id", storeId).eq("order_id", order.id).eq("status", "reserved").limit(1).maybeSingle();
    const reservedSpace = spaces.find((space) => space.id === reservation?.space_id);
    setActiveReservation(reservation && reservedSpace ? { id: reservation.id, spaceId: reservation.space_id, productId: reservedSpace.productId, startsAt: reservation.starts_at, endsAt: reservation.ends_at, guestCount: reservation.guest_count, customerName: reservation.customer_name ?? undefined, orderId: order.id, holdExpiresAt: reservation.hold_expires_at } : null);
    setOrderMenuOpen(false);
  }
  async function cancelOpenOrder(order: SavedOrder) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("cancel_pos_order", { p_order_id: order.id });
    if (error) { setNotice(`Bon gagal dibatalkan: ${error.message}`); return; }
    setOpenOrders((current) => current.filter((item) => item.id !== order.id));
    if (savedOrder?.id === order.id) { setSavedOrder(null); setCart([]); setActiveReservation(null); setSelectedTable(null); requestId.current = null; requestSignature.current = null; }
    if (order.tableCode) setTables((current) => current.map((table) => table.code === order.tableCode ? { ...table, status: "available" } : table));
    setNotice(`Bon ${order.code} dibatalkan.`);
  }
  async function chooseTable(table: StoreTable) {
    if (table.status !== "available" && selectedTable !== table.code) { setNotice("Meja ini sedang dipakai atau ditutup."); return; }
    if (savedOrder?.status === "pending_payment") { setNotice("Meja tidak dapat diganti selama pembayaran menunggu konfirmasi."); return; }
    if (savedOrder && isSupabaseConfigured) {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      const { error } = await supabase.rpc("assign_order_table", { p_order_id: savedOrder.id, p_table_code: table.code });
      if (error) { setNotice(`Meja gagal dipilih: ${error.message}`); return; }
      if (savedOrder.tableCode) setTables((current) => current.map((item) => item.code === savedOrder.tableCode ? { ...item, status: "available" } : item));
      setSavedOrder((current) => current ? { ...current, tableCode: table.code } : current);
      setOpenOrders((current) => current.map((item) => item.id === savedOrder.id ? { ...item, tableCode: table.code } : item));
      setTables((current) => current.map((item) => item.code === table.code ? { ...item, status: "occupied" } : item));
    }
    setSelectedTable(table.code);
  }
  async function openSpaceBooking(product: Product) {
    if (!isSupabaseConfigured || !user || !storeId) { setNotice("Reservasi ruang membutuhkan koneksi Supabase."); return; }
    if (!spaces.some((space) => space.productId === product.id)) { setNotice("Ruang ini belum disiapkan sebagai space reservasi."); return; }
    if (activeReservation?.productId === product.id) {
      const holdExpired = activeReservation.holdExpiresAt && activeReservation.holdExpiresAt !== "infinity" && new Date(activeReservation.holdExpiresAt).getTime() <= Date.now();
      if (!holdExpired || activeReservation.orderId) { setNotice("Reservasi ruang ini sudah masuk ke bon aktif."); return; }
      setActiveReservation(null);
    }
    const currentSpace = cart.find((line) => line.product.kind === "space");
    if (currentSpace && currentSpace.product.id !== product.id) { setNotice("Satu bon hanya dapat menampung satu reservasi space untuk saat ini."); return; }
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const localStart = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setBookingStart(localStart);
    setBookingDuration(2);
    setBookingGuestCount(1);
    setBookingCustomerName("");
    setBookingProduct(product);
  }
  async function confirmSpaceBooking() {
    if (!bookingProduct || !bookingStart || !storeId) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const startsAt = new Date(bookingStart);
    const endsAt = new Date(startsAt.getTime() + bookingDuration * 60 * 60 * 1000);
    if (startsAt.getTime() < Date.now()) { setNotice("Waktu mulai harus di masa depan."); return; }
    setBookingBusy(true);
    const { data, error } = await supabase.rpc("create_space_reservation", {
      p_store_id: storeId, p_product_id: bookingProduct.id, p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString(),
      p_customer_name: bookingCustomerName, p_guest_count: bookingGuestCount,
    });
    setBookingBusy(false);
    if (error) { setNotice(`Reservasi gagal: ${error.message}`); return; }
    const reservation = Array.isArray(data) ? data[0] : data;
    if (!reservation) { setNotice("Supabase tidak mengembalikan reservasi."); return; }
    if (activeReservation && !activeReservation.orderId) {
      await supabase.rpc("cancel_space_reservation", { p_reservation_id: activeReservation.id });
    }
    const space = spaces.find((item) => item.productId === bookingProduct.id);
    setActiveReservation({ id: reservation.reservation_id, spaceId: space?.id ?? "", productId: bookingProduct.id, startsAt: reservation.starts_at, endsAt: reservation.ends_at, guestCount: bookingGuestCount, customerName: bookingCustomerName || undefined, holdExpiresAt: reservation.hold_expires_at });
    setCart((current) => [...current.filter((line) => line.product.id !== bookingProduct.id), { product: bookingProduct, qty: bookingDuration }]);
    setBookingProduct(null);
    setNotice(`Reservasi ${reservation.space_code} dibuat. Simpan bon dalam 15 menit untuk mengikat ruang.`);
    void refreshCatalog();
  }
  async function checkout() {
    if (isSupabaseConfigured && !cashierShift) { setShiftDialogOpen(true); setNotice("Buka shift kasir sebelum menerima pembayaran."); return; }
    let order = savedOrder;
    if (!order || !savedCartCurrent) order = await saveOrder();
    if (!order) return;
    setPaymentOrder(order);
    setPaymentMessage("");
    setSnapUrl("");
    setPaymentOpen(true);
  }
  async function payWithSnap() {
    if (!paymentOrder) return;
    setPaymentBusy(true);
    setPaymentMessage("");
    try {
      const response = await fetch("/api/payments/snap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: paymentOrder.id }) });
      const result = await response.json().catch(() => ({})) as { redirectUrl?: string; error?: string };
      if (!response.ok || !result.redirectUrl) { setPaymentMessage(result.error ?? "Pembayaran online belum dapat dimulai."); return; }
      setSnapUrl(result.redirectUrl);
      if (paymentOrder) {
        setSavedOrder((current) => current?.id === paymentOrder.id ? { ...current, status: "pending_payment" } : current);
        setOpenOrders((current) => current.map((item) => item.id === paymentOrder.id ? { ...item, status: "pending_payment" } : item));
      }
      await refreshCatalog();
    } catch { setPaymentMessage("Tidak dapat terhubung ke server pembayaran."); }
    finally { setPaymentBusy(false); }
  }
  async function payWithCash() {
    if (!paymentOrder) return;
    setPaymentBusy(true);
    setPaymentMessage("");
    try {
      const response = await fetch("/api/payments/cash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: paymentOrder.id }) });
      const result = await response.json().catch(() => ({})) as { paid?: boolean; error?: string };
      if (!response.ok || !result.paid) { setPaymentMessage(result.error ?? "Pembayaran tunai belum dapat dicatat."); return; }
      await completePayment("Pembayaran tunai berhasil dicatat.", "Tunai");
    } catch { setPaymentMessage("Tidak dapat terhubung ke server pembayaran."); }
    finally { setPaymentBusy(false); }
  }
  async function checkPaymentStatus() {
    if (!paymentOrder) return;
    setPaymentBusy(true);
    try {
      const response = await fetch("/api/payments/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: paymentOrder.id }) });
      const result = await response.json().catch(() => ({})) as { orderStatus?: string; paymentStatus?: string; error?: string };
      if (!response.ok) { setPaymentMessage(result.error ?? "Status pembayaran belum dapat diperiksa."); return; }
      if (result.orderStatus === "paid") await completePayment("Pembayaran berhasil dikonfirmasi Midtrans.", "Midtrans");
      else if (result.orderStatus === "paid_review") { setPaymentMessage("Pembayaran masuk, tetapi stok perlu pemeriksaan admin."); await refreshCatalog(); }
      else if (result.orderStatus === "open") {
        setSavedOrder((current) => current ? { ...current, status: "open" } : current);
        setOpenOrders((current) => current.map((item) => item.id === paymentOrder.id ? { ...item, status: "open" } : item));
        setPaymentMessage("Pembayaran gagal atau kedaluwarsa. Bon dapat dicoba kembali.");
        await refreshCatalog();
      }
      else setPaymentMessage("Pembayaran masih menunggu konfirmasi. Coba periksa kembali sebentar lagi.");
    } catch { setPaymentMessage("Tidak dapat menghubungi server status pembayaran."); }
    finally { setPaymentBusy(false); }
  }
  async function completePayment(message: string, method: string) {
    const completedOrder = paymentOrder;
    if (completedOrder) {
      const supabase = createSupabaseBrowserClient();
      let receiptOrder: { order_code: string; subtotal: number; discount_amount: number; tax_amount: number; service_amount: number; total_amount: number; paid_at: string | null; table_code: string | null } | null = null;
      let receiptItems: { product_name: string; quantity: number; unit_price: number; line_total: number }[] = [];
      if (supabase) {
        const [orderResult, itemResult] = await Promise.all([
          supabase.from("orders").select("order_code,subtotal,discount_amount,tax_amount,service_amount,total_amount,paid_at,table_code").eq("id", completedOrder.id).maybeSingle(),
          supabase.from("order_items").select("product_name,quantity,unit_price,line_total").eq("order_id", completedOrder.id).order("created_at"),
        ]);
        receiptOrder = orderResult.data;
        receiptItems = itemResult.data ?? [];
      }
      setLastReceipt({
        code: receiptOrder?.order_code ?? completedOrder.code, storeName, paidAt: receiptOrder?.paid_at ?? new Date().toISOString(), method,
        tableCode: receiptOrder?.table_code ?? completedOrder.tableCode ?? null,
        subtotal: receiptOrder?.subtotal ?? completedOrder.subtotal, discount: receiptOrder?.discount_amount ?? completedOrder.discount,
        tax: receiptOrder?.tax_amount ?? completedOrder.tax, service: receiptOrder?.service_amount ?? completedOrder.service, total: receiptOrder?.total_amount ?? completedOrder.total,
        lines: receiptItems.length ? receiptItems.map((item) => ({ name: item.product_name, quantity: item.quantity, unitPrice: item.unit_price, lineTotal: item.line_total })) : cart.map((line) => ({ name: line.product.name, quantity: line.qty, unitPrice: line.product.price, lineTotal: line.product.price * line.qty })),
      });
      setReceiptOpen(true);
    }
    if (paymentOrder) setOpenOrders((current) => current.filter((order) => order.id !== paymentOrder.id));
    setSavedOrder(null);
    setCart([]);
    setSelectedTable(null);
    setActiveReservation(null);
    requestId.current = null;
    requestSignature.current = null;
    setPaymentOpen(false);
    setPaymentOrder(null);
    setSnapUrl("");
    setNotice(message);
    void refreshCatalog();
    void refreshTables();
  }
  async function openShift() {
    if (!storeId) { setNotice("Gerai belum tersedia untuk membuka shift."); return; }
    const amount = Number(openingCashInput);
    if (!Number.isSafeInteger(amount) || amount < 0) { setNotice("Saldo awal harus berupa angka rupiah nol atau lebih."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setShiftBusy(true);
    const { data, error } = await supabase.rpc("open_cashier_shift", { p_store_id: storeId, p_opening_cash: amount });
    setShiftBusy(false);
    if (error) { setNotice(`Shift gagal dibuka: ${error.message}`); return; }
    const opened = Array.isArray(data) ? data[0] : data;
    if (!opened) { setNotice("Supabase tidak mengembalikan shift aktif."); return; }
    setCashierShift(opened as CashierShift);
    setCountedCashInput(String(amount));
    setShiftDialogOpen(false);
    setNotice("Shift kasir berhasil dibuka.");
  }
  async function closeShift() {
    if (!cashierShift) return;
    const amount = Number(countedCashInput);
    if (!Number.isSafeInteger(amount) || amount < 0) { setNotice("Kas terhitung harus berupa angka rupiah nol atau lebih."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setShiftBusy(true);
    const { data, error } = await supabase.rpc("close_cashier_shift", { p_shift_id: cashierShift.id, p_counted_cash: amount });
    setShiftBusy(false);
    if (error) { setNotice(`Shift gagal ditutup: ${error.message}`); return; }
    const summary = Array.isArray(data) ? data[0] : data;
    if (!summary) { setNotice("Shift ditutup, tetapi ringkasannya tidak tersedia."); return; }
    setCashierShift(null);
    setShiftDialogOpen(false);
    setNotice(`Shift ditutup · tunai Rp ${money(summary.cash_sales)} · non-tunai Rp ${money(summary.other_sales)} · selisih kas ${summary.cash_difference < 0 ? "-" : "+"}Rp ${money(Math.abs(summary.cash_difference))}.`);
  }
  function openAdmin() {
    if (!['owner', 'admin'].includes(memberRole)) return;
    setAdminMessage("");
    setRateDraft({ tax: String(rates.tax / 100), service: String(rates.service / 100), discount: String(rates.discount / 100) });
    setAdminOpen(true);
  }
  function selectAdminProduct(product?: Product) {
    setProductDraft(product ? {
      id: product.id, sku: "", name: product.name, category: product.category, price: String(product.price),
      stock: product.stock === undefined ? "" : String(product.stock), image_url: product.image, tag: product.tag,
    } : { id: "", sku: "", name: "", category: "Kopi", price: "", stock: "", image_url: "", tag: "" });
    if (product?.id) {
      const supabase = createSupabaseBrowserClient();
      void supabase?.from("products").select("sku").eq("id", product.id).maybeSingle().then(({ data }) => {
        if (data) setProductDraft((current) => current.id === product.id ? { ...current, sku: data.sku ?? "" } : current);
      });
    }
  }
  async function saveCatalogProduct() {
    if (!storeId) return;
    const price = Number(productDraft.price);
    const stock = productDraft.stock.trim() === "" ? null : Number(productDraft.stock);
    if (!productDraft.name.trim() || !productDraft.category.trim() || !Number.isSafeInteger(price) || price < 0 || (stock !== null && (!Number.isSafeInteger(stock) || stock < 0))) {
      setAdminMessage("Nama, kategori, harga, dan stok harus diisi dengan format yang benar."); return;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setAdminBusy(true);
    const values = { sku: productDraft.sku.trim() || null, name: productDraft.name.trim(), category: productDraft.category.trim(), price, stock, image_url: productDraft.image_url.trim() || null, tag: productDraft.tag.trim() || null, updated_at: new Date().toISOString() };
    const response = productDraft.id
      ? await supabase.from("products").update(values).eq("store_id", storeId).eq("id", productDraft.id)
      : await supabase.from("products").insert({ ...values, store_id: storeId, kind: "product" });
    setAdminBusy(false);
    if (response.error) { setAdminMessage(`Katalog gagal disimpan: ${response.error.message}`); return; }
    setAdminMessage("Produk berhasil disimpan.");
    await refreshCatalog();
    if (!productDraft.id) selectAdminProduct();
  }
  async function toggleCatalogProduct(product: Product) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !storeId) return;
    const { error } = await supabase.from("products").update({ is_active: false, updated_at: new Date().toISOString() }).eq("store_id", storeId).eq("id", product.id);
    if (error) { setAdminMessage(`Produk gagal diarsipkan: ${error.message}`); return; }
    setAdminMessage(`${product.name} diarsipkan dari katalog kasir.`);
    await refreshCatalog();
    if (productDraft.id === product.id) selectAdminProduct();
  }
  async function saveRates() {
    const values = { tax_rate_bps: Math.round(Number(rateDraft.tax) * 100), service_rate_bps: Math.round(Number(rateDraft.service) * 100), discount_rate_bps: Math.round(Number(rateDraft.discount) * 100) };
    if (Object.values(values).some((value) => !Number.isSafeInteger(value) || value < 0 || value > 10000)) { setAdminMessage("Tarif harus di antara 0% dan 100%."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !storeId) return;
    setAdminBusy(true);
    const { error } = await supabase.from("store_settings").update(values).eq("store_id", storeId);
    setAdminBusy(false);
    if (error) { setAdminMessage(`Tarif gagal disimpan: ${error.message}`); return; }
    setRates({ tax: values.tax_rate_bps, service: values.service_rate_bps, discount: values.discount_rate_bps });
    setAdminMessage("Tarif pajak, layanan, dan diskon berhasil diperbarui.");
  }
  async function loadDailyReport() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !storeId) return;
    setReportLoading(true);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const all: ReportPayment[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from("payments").select("id,order_id,amount,payment_type,paid_at")
        .eq("store_id", storeId).eq("status", "succeeded").gte("paid_at", start.toISOString())
        .order("paid_at", { ascending: false }).range(offset, offset + 999);
      if (error) { setReportLoading(false); setAdminMessage(`Laporan tidak dapat dimuat: ${error.message}`); return; }
      all.push(...(data ?? []) as ReportPayment[]);
      if (!data || data.length < 1000) break;
      offset += 1000;
    }
    setReportLoading(false);
    setReportPayments(all);
  }
  const dailyCash = reportPayments.filter((payment) => payment.payment_type === "cash").reduce((sum, payment) => sum + payment.amount, 0);
  const dailyNonCash = reportPayments.filter((payment) => payment.payment_type !== "cash").reduce((sum, payment) => sum + payment.amount, 0);
  async function loadTransactionHistory() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !storeId) return;
    setHistoryLoading(true);
    const { data: payments, error } = await supabase.from("payments")
      .select("id,order_id,amount,payment_type,paid_at,status,created_at")
      .eq("store_id", storeId).order("created_at", { ascending: false }).limit(100);
    if (error) { setHistoryLoading(false); setNotice(`Riwayat transaksi gagal dimuat: ${error.message}`); return; }
    const orderIds = [...new Set((payments ?? []).map((payment) => payment.order_id))];
    const { data: orders, error: orderError } = orderIds.length
      ? await supabase.from("orders").select("id,order_code,table_code,status").eq("store_id", storeId).in("id", orderIds)
      : { data: [], error: null };
    setHistoryLoading(false);
    if (orderError) { setNotice(`Bon pada riwayat gagal dimuat: ${orderError.message}`); return; }
    setHistoryEntries((payments ?? []).flatMap((payment) => {
      const order = orders?.find((item) => item.id === payment.order_id);
      return order ? [{ paymentId: payment.id, orderId: order.id, code: order.order_code, tableCode: order.table_code, orderStatus: order.status, paymentStatus: payment.status, amount: payment.amount, paymentType: payment.payment_type, paidAt: payment.paid_at, createdAt: payment.created_at }] : [];
    }));
  }
  async function showHistoricalReceipt(entry: HistoryEntry) {
    if (!['paid', 'paid_review'].includes(entry.orderStatus)) { setNotice("Struk hanya tersedia untuk bon yang sudah lunas."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const [{ data: order }, { data: items }] = await Promise.all([
      supabase.from("orders").select("order_code,subtotal,discount_amount,tax_amount,service_amount,total_amount,paid_at,table_code").eq("id", entry.orderId).maybeSingle(),
      supabase.from("order_items").select("product_name,quantity,unit_price,line_total").eq("order_id", entry.orderId).order("created_at"),
    ]);
    if (!order || !items?.length) { setNotice("Detail bon tidak tersedia untuk dicetak."); return; }
    setLastReceipt({
      code: order.order_code, storeName, paidAt: order.paid_at ?? entry.paidAt ?? entry.createdAt,
      method: entry.paymentType === "cash" ? "Tunai" : entry.paymentType ?? "Non-tunai", tableCode: order.table_code,
      subtotal: order.subtotal, discount: order.discount_amount, tax: order.tax_amount, service: order.service_amount, total: order.total_amount,
      lines: items.map((item) => ({ name: item.product_name, quantity: item.quantity, unitPrice: item.unit_price, lineTotal: item.line_total })),
    });
    setHistoryOpen(false);
    setReceiptOpen(true);
  }
  async function refreshCatalog() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !storeId) return;
    const [{ data }, { data: spaceRows }, { data: reservations }] = await Promise.all([
      supabase.from("products").select("id,name,sku,category,kind,price,stock,image_url,tag").eq("store_id", storeId).eq("is_active", true).order("name"),
      supabase.from("store_spaces").select("id,product_id,code,capacity").eq("store_id", storeId).eq("is_active", true),
      supabase.from("space_reservations").select("space_id,status,starts_at,ends_at,hold_expires_at").eq("store_id", storeId).in("status", ["held", "reserved", "checked_in"]),
    ]);
    const now = Date.now();
    if (data) setCatalog(data.map((row) => {
      const space = (spaceRows ?? []).find((entry) => entry.product_id === row.id);
      const bookings = (reservations ?? []).filter((entry) => entry.space_id === space?.id && new Date(entry.ends_at).getTime() > now && (entry.status !== "held" || new Date(entry.hold_expires_at).getTime() > now));
      const tag = row.kind === "space" ? bookings.some((entry) => new Date(entry.starts_at).getTime() <= now) ? "TERPAKAI" : bookings.length ? "BOOKED" : "TERSEDIA" : row.tag ?? "";
      return { id: row.id, name: row.name, sku: row.sku ?? undefined, category: row.category, price: row.price, stock: row.stock ?? undefined, kind: row.kind === "space" ? "space" as const : "product" as const, image: row.image_url ?? "", tag };
    }));
  }
  async function refreshTables() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !storeId) return;
    const { data } = await supabase.from("store_tables").select("code,label,area,capacity,status").eq("store_id", storeId).eq("is_active", true).order("code");
    if (data) setTables(data.map((table) => ({ code: table.code, desc: table.label, area: table.area, capacity: table.capacity, status: table.status === "occupied" || table.status === "closed" ? table.status : "available" })));
  }
  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (receiptOpen) setReceiptOpen(false);
        else if (historyOpen) setHistoryOpen(false);
        else if (adminOpen) setAdminOpen(false);
        else if (shiftDialogOpen) setShiftDialogOpen(false);
        else if (bookingProduct) setBookingProduct(null);
        else if (paymentOpen) setPaymentOpen(false);
        else if (orderMenuOpen) setOrderMenuOpen(false);
        return;
      }
      if (event.key === "F3") { event.preventDefault(); searchInput.current?.focus(); return; }
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (receiptOpen || historyOpen || adminOpen || shiftDialogOpen || bookingProduct || paymentOpen) return;
      if (event.key === "F1") { event.preventDefault(); void startNewOrder(); }
      if (event.key === "F2") { event.preventDefault(); void checkout(); }
      if (event.key === "F4") { event.preventDefault(); void saveOrder(); }
    }
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  });

  if (isSupabaseConfigured && authLoading) return <main className="login-screen"><div className="login-card login-loading"><div className="login-icon"><LockKeyhole size={21} /></div><h1>Menyiapkan terminal…</h1><p>Memeriksa sesi kasir.</p></div></main>;
  if (isSupabaseConfigured && !user) return <main className="login-screen"><LoginForm onLogin={() => setNotice("Berhasil masuk.")} /></main>;
  return (
    <main className="pos-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Command size={19} strokeWidth={3} /></div><span>{storeName}</span><div className="online-chip"><i />{isSupabaseConfigured ? "ONLINE: KASIR" : "MODE DEMO"}</div></div>
        <div className="top-actions"><button className="shift-chip" onClick={() => setShiftDialogOpen(true)}><Clock3 size={14} />{cashierShift ? "Shift Aktif" : "Shift Tutup"}<b>{cashierShift ? new Date(cashierShift.opened_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}</b></button><button className="control-btn" onClick={() => { setCountedCashInput(String(cashierShift?.opening_cash ?? 0)); setShiftDialogOpen(true); }}><LockKeyhole size={15} />{cashierShift ? "Tutup Shift" : "Buka Shift"}</button><button className="icon-btn" aria-label="Riwayat transaksi" title="Riwayat transaksi" onClick={() => { setHistoryOpen(true); void loadTransactionHistory(); }}><History size={16} /></button>{['owner', 'admin'].includes(memberRole) && <button className="icon-btn" aria-label="Pengaturan gerai" title="Katalog, tarif, dan laporan" onClick={openAdmin}><Settings size={16} /></button>}<button className="icon-btn" aria-label="refresh" onClick={() => void refreshCatalog()}><Sparkles size={16} /></button><button className="icon-btn notification" aria-label="notifications"><Bell size={17} /></button>{user ? <button className="avatar" title={user.email ?? "Kasir"} onClick={async () => { await createSupabaseBrowserClient()?.auth.signOut(); }}>KS</button> : <button className="avatar">KS</button>}</div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <section className="store-summary"><div><b>{storeName}</b><small>{user?.email ?? "Terminal #01 - Kasir"}</small></div><span className="live-badge">{isSupabaseConfigured ? "LIVE" : "DEMO"}</span></section>
          <button className="new-table" onClick={() => void startNewOrder(tables.find((table) => table.status === "available")?.code)}><Plus size={17} />Buka Meja Baru</button>
          <section className="categories"><div className="section-label"><span>KATALOG &amp; AREA</span><span>[ESC]</span></div>
            {categories.map((name, i) => <button key={name} onClick={() => setCategory(name)} className={`category-item ${category === name ? "selected" : ""} ${i === 5 ? "space-category" : ""}`}><span className="category-icon">{i === 0 ? <LayoutGrid size={16} /> : i === 1 ? <Coffee size={16} /> : i === 2 ? <Utensils size={16} /> : i === 5 ? <BriefcaseBusiness size={16} /> : <ShoppingBag size={16} />}</span><span>{name}</span>{(i === 0 || i === 5) && <em>{i === 0 ? "18" : "4"}</em>}</button>)}
          </section>
          <section className="tables"><div className="section-label"><span>DENAH MEJA CEPAT</span><b>{tables.filter((table) => table.status === "available").length}/{tables.length} KOSONG</b></div><div className="table-grid">{tables.map((table) => { const tone = table.status === "available" ? "green" : table.status === "closed" ? "yellow" : "red"; return <button className={`table-tile ${selectedTable === table.code ? "table-selected" : ""}`} key={table.code} onClick={() => void chooseTable(table)}><span className={`status-dot ${tone}`} /><b>{table.code}</b><small>{table.area} ({table.capacity}p)</small><span className={`table-status ${tone}`}><i className={`status-dot ${tone}`} />{table.status === "available" ? "Tersedia" : table.status === "closed" ? "Ditutup" : "Terisi"}</span></button>; })}</div></section>
          <button className="help-btn"><CircleHelp size={16} />Bantuan &amp; SOP<span>v2.4</span></button>
        </aside>

        <section className="catalog-area">
          <div className="catalog-toolbar"><div className="search-row"><kbd>[F3]</kbd><div className="search-box"><input ref={searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, SKU, atau kode ruang..." /><button aria-label="search" onClick={() => searchInput.current?.focus()}><Search size={18} /></button></div></div><div className="quick-actions"><button onClick={() => void startNewOrder()}><b>F1:</b> Order Baru</button><button className="quick-primary" onClick={checkout} disabled={orderBusy}><b>F2:</b> {orderBusy ? "Menyimpan…" : "Bayar / Checkout"}</button><button onClick={() => void saveOrder()} disabled={orderBusy}><b>F4:</b> Tahan Bon</button></div></div>
          <div className="filter-bar"><span className="filter-title">TAMPILKAN:</span><div className="filter-buttons">{["Semua", "Kopi & Minuman", "Makanan", "Sewa Space"].map((item) => <button key={item} onClick={() => setActiveFilter(item)} className={activeFilter === item ? "active" : ""}>{item === "Kopi & Minuman" && <Coffee size={13} />}{item === "Makanan" && <Utensils size={13} />}{item}</button>)}</div><div className="legend"><span><i className="status-dot green" />Ready</span><span><i className="status-dot yellow" />Booked</span><span><i className="status-dot red" />Terpakai</span></div></div>
          <div className="product-scroll"><div className="product-grid">{catalogLoading && <div className="empty-state">Memuat katalog dari Supabase…</div>}{filtered.map((product, index) => <motion.article key={product.id} className={`product-card ${product.kind === "space" ? "space-card" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, duration: 0.24 }} layout>
              <div className="product-photo" style={product.image ? { backgroundImage: `url("${product.image}")` } : undefined}><span className={`stock-tag ${product.kind === "space" ? "room-tag" : ""}`}>{product.kind === "space" ? <><span>RUANGAN</span><i className={`status-dot ${product.tag === "TERSEDIA" ? "green" : product.tag === "BOOKED" ? "yellow" : "red"}`} />{product.tag || "SPACE"}</> : <>STOK: {product.stock ?? "∞"}</>}</span>{product.tag === "BESTSELLER" && <span className="best-tag">BESTSELLER</span>}{product.tag === "TERPAKAI" && <span className="occupied-tag">● SEDANG DIPAKAI</span>}</div>
              <div className="product-info"><span className={`product-category ${product.kind === "space" ? "blue-text" : ""}`}>{product.category}</span><h3>{product.name}</h3><div className="product-bottom"><span className="price">Rp {money(product.price)}{product.kind === "space" && <small>/jam</small>}</span><button className={product.kind === "space" ? "book-add" : "add-btn"} onClick={() => product.kind === "space" ? void openSpaceBooking(product) : add(product)} aria-label={`${product.kind === "space" ? "Pesan" : "Tambah"} ${product.name}`}>{product.kind === "space" ? <CalendarDays size={17} /> : <Plus size={20} />}</button></div></div>
            </motion.article>)}{filtered.length === 0 && <div className="empty-state">Menu tidak ditemukan. Coba kata kunci lain.</div>}</div></div>
        </section>

        <aside className="order-panel"><div className="order-heading"><h2><span>▤</span> PESANAN AKTIF</h2><button><i />DINING &amp; RESERVASI<ChevronDown size={12} /></button></div><button className="active-order" onClick={() => setOrderMenuOpen((open) => !open)}><span className="table-code">{savedOrder ? savedOrder.code.slice(-4) : "BON"}</span><span className="order-name"><b>{savedOrder ? savedOrder.code : "Bon belum disimpan"}</b><small>{savedOrder?.status === "pending_payment" ? "Menunggu pembayaran" : selectedTable ? `Meja ${selectedTable}${savedOrder ? " · bon tersimpan" : " · bon baru"}` : savedOrder ? "Draft tersimpan · dapat diperbarui" : "Pilih meja atau mulai bon baru"}</small></span><span className="edit-order"><ChevronDown size={15} /></span></button>
          <AnimatePresence>{orderMenuOpen && <motion.div className="open-order-menu" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}><div className="open-order-title">BON TERBUKA ({openOrders.length})</div>{openOrders.length ? openOrders.map((order) => <div className="open-order-row" key={order.id}><button onClick={() => void selectOpenOrder(order)}><b>{order.code}</b><span>Rp {money(order.total)}</span></button><button className="cancel-order" aria-label={`Batalkan ${order.code}`} onClick={() => void cancelOpenOrder(order)}><Trash2 size={14} /></button></div>) : <p>Belum ada bon tersimpan.</p>}</motion.div>}</AnimatePresence>
          <div className="cart-list"><AnimatePresence initial={false}>{cart.map((line) => <motion.div className="cart-line" key={line.product.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><div className="line-heading"><b>{line.product.name}</b><button onClick={() => update(line.product.id, -line.qty)} disabled={line.product.kind === "space" && activeReservation?.productId === line.product.id} aria-label="hapus item"><Trash2 size={15} /></button></div>{line.product.kind === "space" && <small className="space-rental">{activeReservation ? `Durasi: ${line.qty} jam · ${new Date(activeReservation.startsAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}` : `Durasi: ${line.qty} jam · reservasi belum dibuat`}</small>}<div className="line-bottom"><div className="qty-stepper">{line.product.kind === "space" ? <span>{line.qty} jam</span> : <><button onClick={() => update(line.product.id, -1)} aria-label="kurangi"><Minus size={13} /></button><span>{line.qty}</span><button onClick={() => update(line.product.id, 1)} aria-label="tambah"><Plus size={13} /></button></>}</div><b>Rp {money(line.product.price * line.qty)}</b></div></motion.div>)}</AnimatePresence>{cart.length === 0 && <div className="empty-cart">Bon masih kosong.<br />Pilih menu untuk mulai.</div>}</div>
          <div className="payment-summary"><div><span>Subtotal ({cart.length} Item):</span><b>Rp {money(subtotal)}</b></div><div><span>Pajak ({rates.tax / 100}%):</span><b>Rp {money(tax)}</b></div><div><span>Biaya Layanan ({rates.service / 100}%):</span><b>Rp {money(service)}</b></div><div className="discount-row"><span>Diskon ({rates.discount / 100}%):</span><b>- Rp {money(discount)}</b></div><div className="grand-total"><span><small>TOTAL TAGIHAN {savedOrder ? "TERSIMPAN" : "SEMENTARA"}</small><b>IDR</b></span><strong>{money(total)}</strong></div><button className="pay-button" onClick={checkout} disabled={orderBusy}><CreditCard size={19} /> {savedOrder && savedCartCurrent ? "BAYAR [F2]" : "SIMPAN & BAYAR [F2]"}</button><div className="receipt-actions"><button onClick={() => void startNewOrder()}><BriefcaseBusiness size={14} />Order Baru</button><button onClick={() => lastReceipt && setReceiptOpen(true)} disabled={!lastReceipt}><Printer size={14} />Cetak Struk</button></div></div>
        </aside>
      </div>
      <AnimatePresence>{receiptOpen && lastReceipt && <motion.div className="modal-backdrop receipt-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.section className="receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title" initial={{ y: 14, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
          <div className="receipt-paper">
            <div className="receipt-brand">{lastReceipt.storeName}</div><div className="receipt-caption">BUKTI PEMBAYARAN</div>
            <div className="receipt-meta"><span>No. Bon</span><b>{lastReceipt.code}</b><span>Waktu</span><b>{new Date(lastReceipt.paidAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</b><span>Metode</span><b>{lastReceipt.method}</b>{lastReceipt.tableCode && <><span>Meja</span><b>{lastReceipt.tableCode}</b></>}</div>
            <div className="receipt-divider" />
            <div className="receipt-lines">{lastReceipt.lines.map((line, index) => <div key={`${line.name}-${index}`}><span>{line.name}<small>{line.quantity} × Rp {money(line.unitPrice)}</small></span><b>Rp {money(line.lineTotal)}</b></div>)}</div>
            <div className="receipt-divider" />
            <div className="receipt-totals"><div><span>Subtotal</span><b>Rp {money(lastReceipt.subtotal)}</b></div>{lastReceipt.discount > 0 && <div><span>Diskon</span><b>- Rp {money(lastReceipt.discount)}</b></div>}{lastReceipt.tax > 0 && <div><span>Pajak</span><b>Rp {money(lastReceipt.tax)}</b></div>}{lastReceipt.service > 0 && <div><span>Layanan</span><b>Rp {money(lastReceipt.service)}</b></div>}<div className="receipt-grand"><span>TOTAL</span><b>Rp {money(lastReceipt.total)}</b></div></div>
            <div className="receipt-thanks">Terima kasih telah berkunjung!</div>
          </div>
          <div className="receipt-controls"><button className="control-btn" onClick={() => setReceiptOpen(false)}>Tutup</button><button className="pay-button" onClick={() => window.print()}><Printer size={16} />Cetak struk</button></div>
        </motion.section>
      </motion.div>}</AnimatePresence>
      <AnimatePresence>{historyOpen && <motion.div className="modal-backdrop history-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.section className="payment-modal history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title" initial={{ y: 14, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
          <button className="modal-close" aria-label="Tutup riwayat" onClick={() => setHistoryOpen(false)}><X size={18} /></button>
          <div className="modal-eyebrow">TRANSAKSI GERAI</div><h2 id="history-title">Riwayat pembayaran</h2><p>100 pembayaran terbaru, termasuk transaksi yang perlu ditindaklanjuti.</p>
          <div className="history-list">{historyLoading ? <div className="history-empty">Memuat riwayat transaksi…</div> : historyEntries.length ? historyEntries.map((entry) => {
            const paid = ['paid', 'paid_review'].includes(entry.orderStatus);
            const statusLabel = entry.orderStatus === "paid" ? "LUNAS" : entry.orderStatus === "paid_review" ? "PERLU CEK" : entry.orderStatus === "pending_payment" ? "MENUNGGU" : entry.paymentStatus.toUpperCase();
            return <div className="history-row" key={entry.paymentId}><div className="history-row-main"><b>{entry.code}</b><small>{new Date(entry.paidAt ?? entry.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}{entry.tableCode ? ` · Meja ${entry.tableCode}` : ""}</small></div><div className="history-row-payment"><b>Rp {money(entry.amount)}</b><small>{entry.paymentType === "cash" ? "Tunai" : entry.paymentType ?? "Online"}</small></div><span className={`history-status ${paid ? "paid" : "pending"}`}>{statusLabel}</span><button className="history-receipt" disabled={!paid} onClick={() => void showHistoricalReceipt(entry)} aria-label={`Lihat struk ${entry.code}`}><Printer size={15} /></button></div>;
          }) : <div className="history-empty">Belum ada pembayaran di gerai ini.</div>}</div>
          <button className="check-status history-refresh" onClick={() => void loadTransactionHistory()} disabled={historyLoading}><Sparkles size={14} />Muat ulang riwayat</button>
        </motion.section>
      </motion.div>}</AnimatePresence>
      <AnimatePresence>{adminOpen && <motion.div className="modal-backdrop admin-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.section className="payment-modal admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title" initial={{ y: 14, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
          <button className="modal-close" aria-label="Tutup pengaturan" onClick={() => setAdminOpen(false)}><X size={18} /></button>
          <div className="modal-eyebrow">OWNER / ADMIN</div><h2 id="admin-title">Pengaturan gerai</h2>
          <div className="admin-tabs"><button className={adminTab === "catalog" ? "active" : ""} onClick={() => setAdminTab("catalog")}><ShoppingBag size={14} />Katalog</button><button className={adminTab === "rates" ? "active" : ""} onClick={() => setAdminTab("rates")}><Settings size={14} />Tarif</button><button className={adminTab === "report" ? "active" : ""} onClick={() => { setAdminTab("report"); void loadDailyReport(); }}><FileBarChart size={14} />Laporan hari ini</button></div>
          {adminTab === "catalog" && <div className="admin-content">
            <div className="admin-product-list"><button className="admin-product-new" onClick={() => selectAdminProduct()}>+ Produk baru</button>{catalog.filter((product) => product.kind === "product").map((product) => <button key={product.id} className={`admin-product-option ${productDraft.id === product.id ? "active" : ""}`} onClick={() => selectAdminProduct(product)}><span><b>{product.name}</b><small>Rp {money(product.price)} · {product.stock ?? "Stok ∞"}</small></span><ChevronDown size={14} /></button>)}</div>
            <div className="admin-form"><label>Nama produk<input value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} /></label><div className="admin-two"><label>SKU<input value={productDraft.sku} onChange={(event) => setProductDraft({ ...productDraft, sku: event.target.value })} /></label><label>Kategori<input value={productDraft.category} onChange={(event) => setProductDraft({ ...productDraft, category: event.target.value })} /></label></div><div className="admin-two"><label>Harga (Rp)<input type="number" min={0} step={1000} value={productDraft.price} onChange={(event) => setProductDraft({ ...productDraft, price: event.target.value })} /></label><label>Stok (kosong = ∞)<input type="number" min={0} step={1} value={productDraft.stock} onChange={(event) => setProductDraft({ ...productDraft, stock: event.target.value })} /></label></div><label>URL foto<input value={productDraft.image_url} onChange={(event) => setProductDraft({ ...productDraft, image_url: event.target.value })} /></label><label>Label katalog<input value={productDraft.tag} onChange={(event) => setProductDraft({ ...productDraft, tag: event.target.value })} placeholder="BESTSELLER / BARU" /></label><div className="admin-form-actions"><button className="login-submit" onClick={() => void saveCatalogProduct()} disabled={adminBusy}><Save size={16} />{adminBusy ? "Menyimpan…" : "Simpan produk"}</button>{productDraft.id && <button className="admin-archive" onClick={() => { const product = catalog.find((entry) => entry.id === productDraft.id); if (product) void toggleCatalogProduct(product); }}>Arsipkan</button>}</div></div>
          </div>}
          {adminTab === "rates" && <div className="admin-rates"><p>Tarif diterapkan pada bon baru oleh perhitungan server Supabase.</p><label>Pajak (%)<input type="number" min={0} max={100} step="0.01" value={rateDraft.tax} onChange={(event) => setRateDraft({ ...rateDraft, tax: event.target.value })} /></label><label>Biaya layanan (%)<input type="number" min={0} max={100} step="0.01" value={rateDraft.service} onChange={(event) => setRateDraft({ ...rateDraft, service: event.target.value })} /></label><label>Diskon umum (%)<input type="number" min={0} max={100} step="0.01" value={rateDraft.discount} onChange={(event) => setRateDraft({ ...rateDraft, discount: event.target.value })} /></label><button className="login-submit" onClick={() => void saveRates()} disabled={adminBusy}><Save size={16} />{adminBusy ? "Menyimpan…" : "Simpan tarif"}</button></div>}
          {adminTab === "report" && <div className="admin-report"><div className="report-day">PENJUALAN HARI INI · {new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}</div><div className="report-stats"><div><small>TRANSAKSI</small><b>{reportPayments.length}</b></div><div><small>TUNAI</small><b>Rp {money(dailyCash)}</b></div><div><small>NON-TUNAI</small><b>Rp {money(dailyNonCash)}</b></div><div><small>TOTAL</small><b>Rp {money(dailyCash + dailyNonCash)}</b></div></div><div className="report-list">{reportLoading ? <p>Memuat transaksi…</p> : reportPayments.length ? reportPayments.map((payment) => <div key={payment.id}><span><b>{payment.order_id.slice(0, 8).toUpperCase()}</b><small>{payment.payment_type ?? "Online"} · {payment.paid_at ? new Date(payment.paid_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}</small></span><strong>Rp {money(payment.amount)}</strong></div>) : <p>Belum ada pembayaran lunas hari ini.</p>}</div><button className="check-status" onClick={() => void loadDailyReport()} disabled={reportLoading}><Sparkles size={14} />Muat ulang laporan</button></div>}
          {adminMessage && <div className="payment-message" role="status">{adminMessage}</div>}
        </motion.section>
      </motion.div>}</AnimatePresence>
      <AnimatePresence>{shiftDialogOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.section className="payment-modal booking-modal" role="dialog" aria-modal="true" aria-labelledby="shift-title" initial={{ y: 14, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
          <button className="modal-close" aria-label="Tutup dialog shift" onClick={() => setShiftDialogOpen(false)}><X size={18} /></button>
          <div className="modal-eyebrow">OPERASIONAL KASIR</div>
          <h2 id="shift-title">{cashierShift ? "Tutup shift" : "Buka shift"}</h2>
          {cashierShift ? <>
            <p>Shift dimulai {new Date(cashierShift.opened_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} dengan saldo awal <strong>Rp {money(cashierShift.opening_cash)}</strong>.</p>
            <label>Kas terhitung saat ini<input type="number" min={0} step={1000} value={countedCashInput} onChange={(event) => setCountedCashInput(event.target.value)} placeholder="Hitung uang tunai di laci" /></label>
            <small className="payment-legal">Saat shift ditutup, aplikasi menghitung tunai yang diharapkan dan mencatat selisih untuk rekonsiliasi.</small>
            <button className="login-submit" onClick={() => void closeShift()} disabled={shiftBusy}><LockKeyhole size={17} />{shiftBusy ? "Menutup shift…" : "Tutup shift & rekonsiliasi"}</button>
          </> : <>
            <p>Masukkan saldo awal laci kas. Pembayaran hanya bisa diterima setelah shift dibuka.</p>
            <label>Saldo awal tunai<input type="number" min={0} step={1000} value={openingCashInput} onChange={(event) => setOpeningCashInput(event.target.value)} /></label>
            <button className="login-submit" onClick={() => void openShift()} disabled={shiftBusy}><Clock3 size={17} />{shiftBusy ? "Membuka shift…" : "Buka shift kasir"}</button>
          </>}
        </motion.section>
      </motion.div>}</AnimatePresence>
      <AnimatePresence>{bookingProduct && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.section className="payment-modal booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title" initial={{ y: 14, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
          <button className="modal-close" aria-label="Tutup reservasi" onClick={() => setBookingProduct(null)}><X size={18} /></button>
          <div className="modal-eyebrow">RESERVASI RUANG / {spaces.find((space) => space.productId === bookingProduct.id)?.code ?? "SPACE"}</div>
          <h2 id="booking-title">{bookingProduct.name}</h2>
          <p>Atur waktu kunjungan dan jumlah tamu.</p>
          <label>Mulai reservasi<input type="datetime-local" step={3600} value={bookingStart} onChange={(event) => setBookingStart(event.target.value)} /></label>
          <div className="booking-fields"><label>Durasi (jam)<input type="number" min={1} max={8} value={bookingDuration} onChange={(event) => setBookingDuration(Math.max(1, Math.min(8, Number(event.target.value))))} /></label><label>Jumlah tamu<input type="number" min={1} max={spaces.find((space) => space.productId === bookingProduct.id)?.capacity ?? 1} value={bookingGuestCount} onChange={(event) => setBookingGuestCount(Math.max(1, Number(event.target.value)))} /></label></div>
          <label>Nama pemesan<input value={bookingCustomerName} onChange={(event) => setBookingCustomerName(event.target.value)} placeholder="Opsional" /></label>
          <div className="booking-total"><span>Estimasi sewa</span><b>Rp {money(bookingProduct.price * bookingDuration)}</b></div>
          <button className="login-submit" onClick={() => void confirmSpaceBooking()} disabled={bookingBusy}><CalendarDays size={17} />{bookingBusy ? "Menyimpan reservasi…" : "Reservasi & Tambah ke Bon"}</button>
          <small className="payment-legal">Ruang ditahan 15 menit. Simpan bon untuk mengikat reservasi ke pesanan.</small>
        </motion.section>
      </motion.div>}</AnimatePresence>
      <AnimatePresence>{paymentOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title" initial={{ y: 14, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
          <button className="modal-close" aria-label="Tutup pembayaran" onClick={() => setPaymentOpen(false)}><X size={18} /></button>
          <div className="modal-eyebrow">{paymentOrder?.code ?? "CHECKOUT"}</div>
          <h2 id="payment-title">Pilih metode pembayaran</h2>
          <p>Total tagihan <strong>Rp {money(paymentOrder?.total ?? total)}</strong></p>
          <button className="method-button" onClick={() => void payWithSnap()} disabled={paymentBusy}><CreditCard size={19} /><span><b>QRIS / pembayaran online</b><small>Dibuat aman melalui halaman Midtrans</small></span><ChevronDown size={16} /></button>
          <button className="method-button" onClick={() => void payWithCash()} disabled={paymentBusy || paymentOrder?.status === "pending_payment"}><Banknote size={19} /><span><b>Tunai</b><small>{paymentOrder?.status === "pending_payment" ? "Selesaikan atau batalkan pembayaran online dahulu" : "Konfirmasi pembayaran di kasir"}</small></span><ChevronDown size={16} /></button>
          {paymentBusy && <div className="payment-progress"><span className="spin-dot" />Memproses pembayaran…</div>}
          {snapUrl && <a className="snap-link" href={snapUrl} target="_blank" rel="noreferrer">Buka halaman pembayaran Midtrans ↗</a>}
          {snapUrl && <button className="check-status" onClick={() => void checkPaymentStatus()} disabled={paymentBusy}>Periksa status pembayaran</button>}
          {paymentMessage && <div className="payment-message" role="status">{paymentMessage}</div>}
          <small className="payment-legal">Kasir menetapkan lunas setelah konfirmasi pembayaran berhasil.</small>
        </motion.section>
      </motion.div>}</AnimatePresence>
      <AnimatePresence>{notice && <motion.div className="toast" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}><Check size={17} />{notice}<button onClick={() => setNotice("")}><X size={15} /></button></motion.div>}</AnimatePresence>
    </main>
  );
}
