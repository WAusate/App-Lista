import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { ArrowDownUp, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Copy, History, Home, Minus, PackageOpen, Pencil, Plus, QrCode, Receipt, RefreshCw, Search, Share2, ShoppingBasket, Trash2, Users, X } from 'lucide-react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { useAddListItem, useClearBought, useCreateHousehold, useCreateItem, useDeleteItem, useDeleteListItem, useGetHousehold, useJoinHousehold, useResetList, useResolveReceipt, useUpdateItem, useUpdateListItem, getGetHouseholdQueryKey } from '@workspace/api-client-react';
import type { CatalogItem, HistoryRecord, HouseholdState, ListItem } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const categories = ['Hortifruti', 'Geladeira', 'Despensa', 'Limpeza', 'Higiene'];
const categoryColors: Record<string, string> = { Hortifruti: 'bg-[#e1efdb]', Geladeira: 'bg-[#dcecf0]', Despensa: 'bg-[#f4e5c9]', Limpeza: 'bg-[#e6e0f3]', Higiene: 'bg-[#f6ded9]' };

function useHouseholdCode() {
  const [code, setCode] = useState(() => localStorage.getItem('compra-em-casa-code') ?? '');
  const save = (next: string) => { localStorage.setItem('compra-em-casa-code', next); setCode(next); };
  return [code, save] as const;
}

function Shell({ children, code, onHouse }: { children: React.ReactNode; code: string; onHouse: () => void }) {
  const [location] = useLocation();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const onlineNow = () => setOnline(true);
    const offlineNow = () => setOnline(false);
    window.addEventListener('online', onlineNow);
    window.addEventListener('offline', offlineNow);
    return () => { window.removeEventListener('online', onlineNow); window.removeEventListener('offline', offlineNow); };
  }, []);
  const nav = [{ href: '/', label: 'Comprar', icon: ShoppingBasket }, { href: '/items', label: 'Meus itens', icon: PackageOpen }, { href: '/history', label: 'Histórico', icon: History }];
  return <div className="app-noise min-h-[100dvh] bg-background">
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-5 lg:px-10">
        <Link href="/" data-testid="link-logo" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShoppingBasket size={19} strokeWidth={2.4} /></span>
          <span className="font-display text-[1.35rem] tracking-[-.03em]">Compra em Casa</span>
        </Link>
        <button onClick={onHouse} data-testid="button-household" className="group flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground transition hover:border-primary/40 hover:text-primary">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Users size={13} /></span>
          <span className="hidden sm:inline">{code || 'Conectar casa'}</span><ChevronDown size={13} className="transition group-hover:rotate-180" />
        </button>
      </div>
    </header>
    {!online && <div className="border-b border-accent/30 bg-accent/10 px-5 py-2 text-center text-xs font-bold text-accent-foreground" data-testid="status-offline">Você está offline. As alterações voltam a sincronizar quando a conexão retornar.</div>}
    <main className="mx-auto max-w-6xl px-5 pb-28 pt-7 lg:ml-[15rem] lg:max-w-[calc(100%-15rem)] lg:px-10 lg:pb-12">{children}</main>
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-card/95 px-5 py-2.5 backdrop-blur-lg lg:hidden">
      <div className="mx-auto flex max-w-md justify-around">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`} className={`flex min-w-[5rem] flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-bold transition ${location === href ? 'text-primary' : 'text-muted-foreground'}`}><Icon size={20} strokeWidth={location === href ? 2.5 : 1.8} /><span>{label}</span></Link>)}</div>
    </nav>
    <aside className="fixed bottom-7 left-7 top-24 hidden w-52 flex-col justify-between lg:flex">
      <div className="space-y-2">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-side-${label.toLowerCase().replace(' ', '-')}`} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${location === href ? 'bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(47,92,79,.18)]' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}><Icon size={18} />{label}</Link>)}</div>
      <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground"><CircleHelp size={17} className="mb-2 text-accent" /><p className="leading-relaxed">A lista fica melhor quando todo mundo participa.</p></div>
    </aside>
    <div className="lg:ml-52">{/* desktop content offset handled by max-width layout */}</div>
  </div>;
}

function LoadingState() {
  return <div className="space-y-4 animate-pulse"><div className="h-8 w-48 rounded bg-muted" /><div className="h-36 rounded-[1.5rem] bg-muted" /><div className="h-16 rounded-2xl bg-muted" /><div className="h-16 rounded-2xl bg-muted" /></div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="rounded-[1.5rem] border border-accent/30 bg-accent/10 px-6 py-12 text-center"><p className="font-display text-2xl">A lista deu uma pausa.</p><p className="mt-2 text-sm text-muted-foreground">Não conseguimos atualizar agora. Tente de novo.</p><button onClick={onRetry} data-testid="button-retry" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"><RefreshCw size={15} /> Tentar novamente</button></div>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true">
    <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'} animate-enter rounded-t-[1.75rem] border border-border bg-card p-6 shadow-2xl sm:rounded-[1.75rem]`}>
      <div className="mb-6 flex items-start justify-between"><h2 className="font-display text-2xl">{title}</h2><button onClick={onClose} data-testid="button-close-modal" className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"><X size={18} /></button></div>{children}
    </div>
  </div>;
}

function HouseholdModal({ code, onClose, onSave }: { code: string; onClose: () => void; onSave: (code: string) => void }) {
  const [mode, setMode] = useState<'choose' | 'join' | 'create'>(code ? 'choose' : 'choose');
  const [joinCode, setJoinCode] = useState('');
  const join = useJoinHousehold();
  const create = useCreateHousehold();
  const pending = join.isPending || create.isPending;
  const finish = (state: HouseholdState) => { onSave(state.code); onClose(); };
  if (mode === 'choose') return <Modal title={code ? 'Sua casa' : 'Vamos conectar sua casa'} onClose={onClose}>
    <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{code ? 'Compartilhe o código com quem mora com você para todo mundo ver a mesma lista.' : 'Crie uma casa nova ou entre em uma que já existe.'}</p>
    {code && <div className="mb-5 flex items-center justify-between rounded-2xl bg-secondary/60 p-4"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">Código da casa</p><p className="mt-1 font-mono text-lg font-bold">{code}</p></div><button onClick={() => navigator.clipboard?.writeText(code)} data-testid="button-copy-code" className="rounded-xl bg-card p-2.5 text-primary"><Copy size={17} /></button></div>}
    <div className="grid gap-3 sm:grid-cols-2"><button onClick={() => setMode('create')} data-testid="button-create-household" className="rounded-2xl bg-primary p-4 text-left text-primary-foreground"><Plus size={18} /><span className="mt-4 block text-sm font-bold">Criar uma casa</span><span className="mt-1 block text-xs opacity-80">Começar uma lista do zero</span></button><button onClick={() => setMode('join')} data-testid="button-join-household" className="rounded-2xl border border-border p-4 text-left transition hover:bg-secondary/60"><Users size={18} className="text-primary" /><span className="mt-4 block text-sm font-bold">Entrar em uma casa</span><span className="mt-1 block text-xs text-muted-foreground">Usar um código de convite</span></button></div>
  </Modal>;
  if (mode === 'join') return <Modal title="Entrar em uma casa" onClose={onClose}><p className="mb-5 text-sm text-muted-foreground">Digite o código que alguém compartilhou com você.</p><input autoFocus value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="CASA-XXXX" maxLength={9} data-testid="input-household-code" className="w-full rounded-xl border border-input bg-background px-4 py-3 font-mono text-lg tracking-widest outline-none ring-primary/20 focus:ring-4" />{join.isError && <p className="mt-2 text-sm text-destructive">Não encontramos essa casa. Confira o código.</p>}<button disabled={pending || !/^CASA-[A-Z0-9]{4}$/.test(joinCode)} onClick={() => join.mutate({ data: { code: joinCode } }, { onSuccess: finish })} data-testid="button-submit-join" className="mt-5 w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground disabled:opacity-50">{pending ? 'Conectando…' : 'Entrar na casa'}</button></Modal>;
  return <Modal title="Criar uma casa" onClose={onClose}><p className="mb-5 text-sm leading-relaxed text-muted-foreground">Você poderá convidar sua família depois. A primeira lista começa vazia, do jeitinho de vocês.</p><button disabled={pending} onClick={() => create.mutate({ data: {} }, { onSuccess: finish })} data-testid="button-submit-create" className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground disabled:opacity-50">{pending ? 'Criando…' : 'Criar minha casa'}</button></Modal>;
}

function ReceiptModal({ onClose, code }: { onClose: () => void; code: string }) {
  const [qrUrl, setQrUrl] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanSessionRef = useRef(0);
  const resolve = useResolveReceipt({ request: { headers: { 'X-House-Code': code } } });
  const qc = useQueryClient();
  const stopCamera = () => {
    scanSessionRef.current += 1;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(track => track.stop());
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setCameraActive(false);
  };
  const openCamera = async () => {
    setCameraMessage('');
    if (!window.isSecureContext) {
      setCameraMessage('Para usar a câmera, abra o app em uma conexão segura (HTTPS). Você também pode colar o endereço do QR Code abaixo.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage('Este navegador não oferece acesso à câmera. Cole o endereço do QR Code abaixo.');
      return;
    }
    const video = videoRef.current;
    if (!video) {
      setCameraMessage('Não foi possível preparar a câmera. Feche e abra esta janela novamente.');
      return;
    }
    const session = ++scanSessionRef.current;
    setCameraActive(true);
    setCameraMessage('Solicitando acesso à câmera…');
    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(undefined, video, (result, _error, controls) => {
        if (session !== scanSessionRef.current) {
          controls.stop();
          return;
        }
        scannerControlsRef.current = controls;
        if (result) {
          setQrUrl(result.getText());
          setCameraMessage('QR Code lido. Confira o endereço antes de importar.');
          stopCamera();
        }
      });
      if (session !== scanSessionRef.current) {
        controls.stop();
        return;
      }
      scannerControlsRef.current = controls;
      setCameraMessage('Aponte a câmera para o QR Code do cupom.');
    } catch (error) {
      if (session !== scanSessionRef.current) return;
      stopCamera();
      const errorName = error instanceof Error ? error.name : '';
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setCameraMessage('A permissão da câmera foi negada. Autorize o acesso nas configurações do navegador ou cole o endereço do QR Code.');
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        setCameraMessage('Nenhuma câmera foi encontrada neste dispositivo. Cole o endereço do QR Code abaixo.');
      } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
        setCameraMessage('A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente, ou cole o endereço do QR Code.');
      } else {
        setCameraMessage('Não foi possível abrir a câmera. Confira a permissão do navegador ou cole o endereço do QR Code.');
      }
    }
  };
  useEffect(() => () => {
    scanSessionRef.current += 1;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(track => track.stop());
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);
  const submit = () => resolve.mutate({ data: { qrUrl } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetHouseholdQueryKey(code) }); stopCamera(); onClose(); } });
  return <Modal title="Importar cupom fiscal" onClose={() => { stopCamera(); onClose(); }}>
    <div className="mb-5 rounded-2xl bg-secondary/60 p-4">
      <QrCode size={22} className="mb-2 text-primary" />
      <p className="text-sm font-bold">Escaneie o QR Code do cupom</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Use a câmera traseira quando disponível ou cole o endereço da NFC-e.</p>
    </div>
    <div className={`${cameraActive ? 'mb-4' : 'hidden'} overflow-hidden rounded-2xl border border-primary/30 bg-foreground`}>
      <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
      <button type="button" onClick={stopCamera} data-testid="button-stop-camera" className="m-3 rounded-lg bg-background/90 px-3 py-2 text-xs font-bold text-foreground">Parar câmera</button>
    </div>
    <label className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">URL do QR Code</label>
    <input value={qrUrl} onChange={e => setQrUrl(e.target.value)} placeholder="https://..." data-testid="input-receipt-url" className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/15" />
    {cameraMessage && <p className="mt-2 text-sm text-muted-foreground">{cameraMessage}</p>}
    {resolve.isError && <p className="mt-2 text-sm text-destructive">Não conseguimos ler esse cupom. Confira a URL.</p>}
    <div className="mt-5 flex gap-3">
      <button type="button" onClick={openCamera} disabled={cameraActive} data-testid="button-open-camera" className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-bold disabled:opacity-50"><QrCode size={16} /> Abrir câmera</button>
      <button type="button" disabled={resolve.isPending || !qrUrl.trim()} onClick={submit} data-testid="button-import-receipt" className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{resolve.isPending ? 'Lendo…' : 'Importar cupom'}</button>
    </div>
  </Modal>;
}

type ItemDraft = { name: string; category: string; emoji: string; defaultQty: number; unit: string; note: string };
const emptyDraft: ItemDraft = { name: '', category: 'Despensa', emoji: '🛒', defaultQty: 1, unit: 'un', note: '' };
function ItemModal({ onClose, onSaved, code, item }: { onClose: () => void; onSaved: (state: HouseholdState) => void; code: string; item?: CatalogItem }) {
  const [draft, setDraft] = useState<ItemDraft>(item ? { name: item.name, category: item.category, emoji: item.emoji, defaultQty: item.defaultQty, unit: item.unit, note: item.note ?? '' } : emptyDraft);
  const create = useCreateItem({ request: { headers: { 'X-House-Code': code } } }); const update = useUpdateItem({ request: { headers: { 'X-House-Code': code } } });
  const set = (key: keyof ItemDraft, value: string | number) => setDraft(prev => ({ ...prev, [key]: value }));
  const submit = (e: React.FormEvent) => { e.preventDefault(); const data = { ...draft, defaultQty: Number(draft.defaultQty), ...(item ? { id: item.id } : {}) }; if (item) update.mutate({ id: item.id, data }, { onSuccess: onSaved }); else create.mutate({ data }, { onSuccess: onSaved }); };
  const busy = create.isPending || update.isPending;
  return <Modal title={item ? 'Editar item' : 'Adicionar item'} onClose={onClose}><form onSubmit={submit} className="space-y-4"><div className="grid grid-cols-[4.5rem_1fr] gap-3"><div><label className="text-xs font-bold text-muted-foreground">Emoji</label><input value={draft.emoji} onChange={e => set('emoji', e.target.value)} maxLength={2} data-testid="input-item-emoji" className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-3 text-center text-2xl outline-none" /></div><div><label className="text-xs font-bold text-muted-foreground">Nome do item</label><input required value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Ex.: Tomate" data-testid="input-item-name" className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/15" /></div></div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-muted-foreground">Categoria<select value={draft.category} onChange={e => set('category', e.target.value)} data-testid="select-item-category" className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm font-normal outline-none">{categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="text-xs font-bold text-muted-foreground">Unidade<input required value={draft.unit} onChange={e => set('unit', e.target.value)} data-testid="input-item-unit" className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm font-normal outline-none" /></label></div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-muted-foreground">Quantidade padrão<input required type="number" min={1} value={draft.defaultQty} onChange={e => set('defaultQty', Number(e.target.value))} data-testid="input-item-quantity" className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm font-normal outline-none" /></label><label className="text-xs font-bold text-muted-foreground">Observação<input value={draft.note} onChange={e => set('note', e.target.value)} placeholder="Opcional" data-testid="input-item-note" className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm font-normal outline-none" /></label></div><button disabled={busy} data-testid="button-save-item" className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground disabled:opacity-50">{busy ? 'Salvando…' : item ? 'Salvar alterações' : 'Adicionar item'}</button></form></Modal>;
}

function useStateData(code: string) {
  return useGetHousehold(code, { query: { enabled: Boolean(code), queryKey: getGetHouseholdQueryKey(code) } });
}

function HomePage({ code, onHouse, onReceipt }: { code: string; onHouse: () => void; onReceipt: () => void }) {
  const query = useStateData(code);
  const state = query.data;
  const qc = useQueryClient();
  const update = useUpdateListItem({ request: { headers: { 'X-House-Code': code } } }); const remove = useDeleteListItem({ request: { headers: { 'X-House-Code': code } } }); const clear = useClearBought({ request: { headers: { 'X-House-Code': code } } }); const reset = useResetList({ request: { headers: { 'X-House-Code': code } } }); const add = useAddListItem({ request: { headers: { 'X-House-Code': code } } });
  const [filter, setFilter] = useState<'all' | 'open' | 'bought'>('open');
  const [category, setCategory] = useState('Todas');
  const categoriesPresent = useMemo(() => ['Todas', ...Array.from(new Set((state?.list ?? []).map(i => i.item?.category).filter(Boolean) as string[]))], [state?.list]);
  const list = useMemo(() => (state?.list ?? []).filter(i => (filter === 'all' || (filter === 'open' ? !i.bought : i.bought)) && (category === 'Todas' || i.item?.category === category)), [state?.list, filter, category]);
  const refresh = () => qc.invalidateQueries({ queryKey: getGetHouseholdQueryKey(code) });
  const mutate = (fn: () => void) => fn();
  if (!code) return <div className="mx-auto max-w-xl py-12 text-center sm:py-24"><div className="mx-auto mb-6 flex h-20 w-20 rotate-3 items-center justify-center rounded-[1.8rem] bg-secondary text-primary"><ShoppingBasket size={38} strokeWidth={1.5} /></div><p className="mb-2 text-xs font-bold uppercase tracking-[.22em] text-accent">Compra em Casa</p><h1 className="font-display text-4xl leading-tight sm:text-5xl">A lista que mora<br />com vocês.</h1><p className="mx-auto mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">Organize as compras, divida a tarefa e comemore cada item riscado.</p><button onClick={onHouse} data-testid="button-start-household" className="mt-8 rounded-xl bg-primary px-6 py-3.5 font-bold text-primary-foreground shadow-[0_10px_22px_rgba(47,92,79,.16)]">Conectar minha casa</button></div>;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !state) return <ErrorState onRetry={refresh} />;
  const total = state.list.length; const bought = state.list.filter(i => i.bought).length; const percent = total ? Math.round((bought / total) * 100) : 0;
  return <div className="animate-enter space-y-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Lista da casa</p><h1 className="mt-1 font-display text-4xl tracking-[-.04em]">Comprar</h1><p className="mt-1 text-sm text-muted-foreground">{total ? `${total - bought} ${total - bought === 1 ? 'item pendente' : 'itens pendentes'}` : 'Sua lista está pronta para começar'}</p></div><div className="flex gap-2"><button onClick={onReceipt} data-testid="button-receipt" className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-bold hover:bg-secondary/60"><Receipt size={16} className="text-accent" /><span className="hidden sm:inline">Ler cupom</span></button><Link href="/history" data-testid="link-history-shortcut" className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-bold hover:bg-secondary/60"><History size={16} className="text-primary" /><span className="hidden sm:inline">Histórico</span></Link></div></div>
    <section className="relative overflow-hidden rounded-[1.6rem] bg-primary p-6 text-primary-foreground shadow-[0_14px_32px_rgba(47,92,79,.15)]"><div className="relative z-10 flex items-center justify-between"><div><p className="text-sm opacity-75">Progresso da compra</p><p className="mt-1 font-display text-4xl">{percent}% <span className="font-sans text-sm font-medium opacity-70">feito</span></p></div><div className="flex h-20 w-20 items-center justify-center rounded-full border-[7px] border-primary-foreground/20 text-xl font-bold"><span className="flex h-full w-full items-center justify-center rounded-full border-[7px] border-accent">{bought}<span className="text-sm opacity-70">/{total}</span></span></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-primary-foreground/15"><div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${percent}%` }} /></div><div className="absolute -bottom-10 -right-2 h-36 w-36 rounded-full border border-primary-foreground/10" /></section>
    {total > 0 && <div className="flex gap-2 overflow-x-auto pb-1">{['open', 'all', 'bought'].map(f => <button key={f} onClick={() => setFilter(f as typeof filter)} data-testid={`button-filter-${f}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition ${filter === f ? 'bg-foreground text-background' : 'bg-secondary/70 text-muted-foreground hover:bg-secondary'}`}>{f === 'open' ? 'Falta comprar' : f === 'all' ? 'Tudo' : 'Já comprados'}</button>)}</div>}
    {total > 0 && <div className="flex items-center gap-2 overflow-x-auto pb-1">{categoriesPresent.map(c => <button key={c} onClick={() => setCategory(c)} data-testid={`button-category-${c}`} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${category === c ? 'bg-accent/20 text-accent-foreground' : 'text-muted-foreground hover:bg-secondary/60'}`}>{c}</button>)}</div>}
    {list.length === 0 ? <div className="rounded-[1.5rem] border border-dashed border-border px-6 py-14 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary"><Check size={25} /></div><h2 className="mt-4 font-display text-2xl">{total === 0 ? 'Tudo começa com um item' : filter === 'bought' ? 'Ainda não tem itens comprados' : 'Tudo em ordem por aqui'}</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{total === 0 ? 'Vá em Meus itens e adicione os essenciais da casa à lista.' : 'Mude o filtro ou aproveite para descansar — a lista está leve.'}</p>{total > 0 && filter === 'open' && bought > 0 && <button onClick={() => clear.mutate(undefined, { onSuccess: refresh })} data-testid="button-clear-bought-empty" className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Limpar comprados</button>}</div> : <div className="space-y-3">{list.map((entry, index) => <ListRow key={entry.id} entry={entry} index={index} onToggle={() => mutate(() => update.mutate({ id: entry.id, data: { bought: !entry.bought } }, { onSuccess: refresh }))} onQuantity={(quantity) => mutate(() => update.mutate({ id: entry.id, data: { quantity } }, { onSuccess: refresh }))} onDelete={() => remove.mutate({ id: entry.id }, { onSuccess: refresh })} />)}</div>}
    <div className="flex flex-wrap justify-between gap-3 pt-1">{total > 0 && bought > 0 && <button onClick={() => clear.mutate(undefined, { onSuccess: refresh })} data-testid="button-clear-bought" className="text-xs font-bold text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">Limpar comprados</button>}{total > 0 && <button onClick={() => reset.mutate(undefined, { onSuccess: refresh })} data-testid="button-reset-list" className="text-xs font-bold text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">Refazer lista do catálogo</button>}</div>
  </div>;
}

function ListRow({ entry, index, onToggle, onQuantity, onDelete }: { entry: ListItem; index: number; onToggle: () => void; onQuantity: (n: number) => void; onDelete: () => void }) {
  const [busy, setBusy] = useState(false);
  const item = entry.item;
  return <div className={`group flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 transition-all duration-300 ${entry.bought ? 'opacity-60' : 'hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]'}`} style={{ animationDelay: `${index * 40}ms` }} data-testid={`row-list-item-${entry.id}`}><button onClick={() => { setBusy(true); onToggle(); setTimeout(() => setBusy(false), 350); }} data-testid={`button-toggle-item-${entry.id}`} className={`check-pop flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 transition ${entry.bought ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent hover:border-primary/60'}`}>{<Check size={16} strokeWidth={3} />}</button><div className="min-w-0 flex-1"><p className={`truncate text-sm font-bold ${entry.bought ? 'line-through' : ''}`}>{item?.emoji} {item?.name ?? 'Item'}</p><p className="mt-0.5 text-xs text-muted-foreground">{item?.unit ?? 'un'}{item?.note ? ` · ${item.note}` : ''}</p></div><div className="flex items-center rounded-xl bg-secondary/70"><button onClick={() => onQuantity(Math.max(1, entry.quantity - 1))} disabled={entry.quantity <= 1} data-testid={`button-minus-${entry.id}`} className="p-2 text-muted-foreground disabled:opacity-30"><Minus size={14} /></button><span className="w-5 text-center text-sm font-bold">{entry.quantity}</span><button onClick={() => onQuantity(entry.quantity + 1)} data-testid={`button-plus-${entry.id}`} className="p-2 text-primary"><Plus size={14} /></button></div><button onClick={onDelete} data-testid={`button-delete-list-${entry.id}`} className="ml-1 rounded-lg p-2 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive max-sm:opacity-100"><Trash2 size={15} /></button></div>;
}

function ItemsPage({ code }: { code: string }) {
  const query = useStateData(code); const state = query.data; const qc = useQueryClient();
  const [search, setSearch] = useState(''); const [modal, setModal] = useState<'new' | CatalogItem | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const add = useAddListItem({ request: { headers: { 'X-House-Code': code } } }); const del = useDeleteItem({ request: { headers: { 'X-House-Code': code } } });
  const refresh = () => qc.invalidateQueries({ queryKey: getGetHouseholdQueryKey(code) });
  const items = (state?.catalog ?? []).filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()));
  const grouped = categories.map(c => [c, items.filter(i => i.category === c)] as const).filter(([, list]) => list.length);
  const saveItem = (s: HouseholdState) => { setModal(null); qc.setQueryData(getGetHouseholdQueryKey(code), s); };
  if (!code) return <EmptyHouse code={code} />;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !state) return <ErrorState onRetry={refresh} />;
  return <div className="animate-enter space-y-7"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Catálogo da casa</p><h1 className="mt-1 font-display text-4xl tracking-[-.04em]">Meus itens</h1><p className="mt-1 text-sm text-muted-foreground">{state.catalog.length} itens salvos para facilitar a próxima compra</p></div><button onClick={() => setModal('new')} data-testid="button-new-item" className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Plus size={17} /><span className="hidden sm:inline">Novo item</span></button></div><label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"><Search size={18} className="text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar no catálogo" data-testid="input-search-items" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></label>{grouped.length === 0 ? <div className="rounded-[1.5rem] border border-dashed border-border px-6 py-14 text-center"><PackageOpen size={32} className="mx-auto text-muted-foreground" /><h2 className="mt-4 font-display text-2xl">Nenhum item encontrado</h2><p className="mt-2 text-sm text-muted-foreground">Tente outro nome ou adicione um novo item.</p></div> : <div className="space-y-4">{grouped.map(([cat, catItems]) => <section key={cat}><button onClick={() => setExpanded(expanded === cat ? null : cat)} data-testid={`button-expand-category-${cat}`} className="mb-2 flex w-full items-center justify-between px-1 text-left"><span className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">{cat} <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[10px]">{catItems.length}</span></span><ChevronDown size={15} className={`text-muted-foreground transition ${expanded === cat ? 'rotate-180' : ''}`} /></button><div className={`grid gap-2 sm:grid-cols-2 ${expanded && expanded !== cat ? 'hidden' : ''}`}>{catItems.map(item => <CatalogRow key={item.id} item={item} onAdd={() => add.mutate({ data: { itemId: item.id, quantity: item.defaultQty } }, { onSuccess: refresh })} onEdit={() => setModal(item)} onDelete={() => { if (confirm(`Excluir ${item.name}?`)) del.mutate({ id: item.id }, { onSuccess: refresh }); }} />)}</div></section>)}</div>}{modal && modal !== 'new' && <ItemModal code={code} item={modal} onClose={() => setModal(null)} onSaved={saveItem} />}{modal === 'new' && <ItemModal code={code} onClose={() => setModal(null)} onSaved={saveItem} />}</div>;
}

function CatalogRow({ item, onAdd, onEdit, onDelete }: { item: CatalogItem; onAdd: () => void; onEdit: () => void; onDelete: () => void }) {
  const [added, setAdded] = useState(false);
  return <div className="group flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 transition hover:shadow-[var(--shadow-soft)]" data-testid={`card-catalog-item-${item.id}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${categoryColors[item.category] ?? 'bg-secondary'}`}>{item.emoji}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.defaultQty} {item.unit}{item.note ? ` · ${item.note}` : ''}</p></div><button onClick={() => { setAdded(true); onAdd(); setTimeout(() => setAdded(false), 1000); }} data-testid={`button-add-catalog-${item.id}`} className={`rounded-xl p-2.5 transition ${added ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary hover:bg-primary hover:text-primary-foreground'}`}>{added ? <Check size={16} /> : <Plus size={16} />}</button><button onClick={onEdit} data-testid={`button-edit-catalog-${item.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil size={15} /></button><button onClick={onDelete} data-testid={`button-delete-catalog-${item.id}`} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={15} /></button></div>;
}

function EmptyHouse({ code }: { code: string }) { return <div className="mx-auto max-w-xl py-16 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary"><Users size={30} /></div><h1 className="mt-5 font-display text-3xl">Conecte sua casa primeiro</h1><p className="mt-2 text-sm text-muted-foreground">Use o botão “Conectar casa” no alto da tela para criar ou entrar em uma casa compartilhada.</p>{code}</div>; }

function HistoryPage({ code }: { code: string }) {
  const query = useStateData(code); const state = query.data; const refresh = () => query.refetch();
  if (!code) return <EmptyHouse code={code} />;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !state) return <ErrorState onRetry={refresh} />;
  const groups = Object.entries((state.history ?? []).reduce<Record<string, HistoryRecord[]>>((acc, record) => { const key = new Date(record.purchasedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); (acc[key] ||= []).push(record); return acc; }, {}));
  const money = (cents?: number | null) => cents == null ? '—' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return <div className="animate-enter space-y-7"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">O que já foi</p><h1 className="mt-1 font-display text-4xl tracking-[-.04em]">Histórico</h1><p className="mt-1 text-sm text-muted-foreground">Um registro simples das compras da casa.</p></div>{groups.length === 0 ? <div className="rounded-[1.5rem] border border-dashed border-border px-6 py-16 text-center"><History size={34} className="mx-auto text-muted-foreground" /><h2 className="mt-4 font-display text-2xl">Ainda não há compras</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Quando vocês marcarem itens como comprados, eles aparecerão aqui.</p><Link href="/" data-testid="link-go-shopping" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Ir para a lista</Link></div> : <div className="space-y-8">{groups.map(([date, records]) => <section key={date}><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl capitalize">{date}</h2><span className="text-xs text-muted-foreground">{records.length} {records.length === 1 ? 'item' : 'itens'}</span></div><div className="space-y-2">{records.map(record => <div key={record.id} data-testid={`row-history-${record.id}`} className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${categoryColors.Geladeira}`}>{record.emoji}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{record.itemName}</p><p className="mt-0.5 text-xs text-muted-foreground">{record.quantity} {record.unit ?? 'un'}{record.supermarket ? ` · ${record.supermarket}` : ''}</p></div><div className="text-right"><p className="text-sm font-bold">{money(record.priceCents)}</p><p className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide ${record.receiptId ? 'text-primary' : 'text-muted-foreground'}`}>{record.receiptId ? 'Cupom lido' : 'Sem cupom'}</p></div></div>)}</div></section>)}</div>}</div>;
}

function Router() {
  const [code, saveCode] = useHouseholdCode(); const [houseModal, setHouseModal] = useState(false); const [receiptModal, setReceiptModal] = useState(false);
  return <Shell code={code} onHouse={() => setHouseModal(true)}><Switch><Route path="/" component={() => <HomePage code={code} onHouse={() => setHouseModal(true)} onReceipt={() => setReceiptModal(true)} />} /><Route path="/items" component={() => <ItemsPage code={code} />} /><Route path="/history" component={() => <HistoryPage code={code} />} /><Route component={NotFound} /></Switch>{houseModal && <HouseholdModal code={code} onClose={() => setHouseModal(false)} onSave={saveCode} />}{receiptModal && code && <ReceiptModal code={code} onClose={() => setReceiptModal(false)} />}</Shell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><Router /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;