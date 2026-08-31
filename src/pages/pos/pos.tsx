import React, { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { formatCurrency, toUpper, getInitials, displayPhone, formatPhone } from "@/lib/utils"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Sheet, SheetTrigger, SheetContent,
} from "@/components/ui/sheet"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Pagination } from "@/components/ui/pagination"
import { useToast } from "@/components/ui/toast"
import { useLocation, useNavigate } from "react-router-dom"
import { useOpenMember } from "@/hooks/useOpenMember"
import { Loader2, Plus, Minus, Trash2, Search, ShoppingCart, Check, ImageIcon, CreditCard, User, Percent, Scan, X, Download, RefreshCw, Ticket, Building2, RotateCcw, Pencil } from "lucide-react"
import type { Product, Member, Corporate } from "@/types/supabase"
import { IS_MOCK } from "@/lib/config"

interface CartItem {
  product: Product
  quantity: number
}

interface PendingSubscriptionInfo {
  member_id: string
  subscription_id: string
  total_amount: number
  subscription_name: string
  organization_id: string
  first_name: string
  last_name: string
}

interface PendingSubRow {
  id: string
  member_id: string
  subscription_type_id: string
  start_date: string
  end_date: string
  total_amount: number
  subscription_types: { name: string; price: number; duration_days: number } | null
}

type SubscriptionTypeOption = { id: string; name: string; price: number; duration_days: number; is_drop_in?: boolean | null }

interface CartPanelProps {
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  memberSearch: string
  setMemberSearch: (v: string) => void
  selectedMemberId: string | null
  setSelectedMemberId: (v: string | null) => void
  discountPercent: number | null
  setDiscountPercent: (v: number | null) => void
  discountAmount: number | null
  setDiscountAmount: (v: number | null) => void
  subtotal: number
  total: number
  currencySymbol: string
  filteredMembers: { id: string; first_name: string; last_name: string; phone: string | null; member_number: string | null }[]
  selectedCorporate: { id: string; company_name: string; discount_rate: number; is_active: boolean; contract_start: string | null; contract_end: string | null } | null
  corporateDiscount: number
  subscriptionSubtotal: number
  corporateRemoved: boolean
  setCorporateRemoved: (v: boolean) => void
  updateQuantity: (productId: string, delta: number) => void
  removeFromCart: (productId: string) => void
  onEditSubscriptionItem: (productId: string) => void
  selectedPendingSub: PendingSubRow | null
  selectedPendingSubInCart: boolean
  onAddPendingSub: () => void
  isProcessing: boolean
  mobileCartOpen: boolean
  onCheckout: () => void
  t: (key: string) => string
}

const CartPanel = React.memo(function CartPanel({
  cart, setCart, memberSearch, setMemberSearch, selectedMemberId, setSelectedMemberId,
  discountPercent, setDiscountPercent, discountAmount, setDiscountAmount,
  subtotal, total, currencySymbol, filteredMembers, selectedCorporate,
  corporateDiscount, subscriptionSubtotal, corporateRemoved, setCorporateRemoved,
  updateQuantity, removeFromCart, onEditSubscriptionItem,
  selectedPendingSub, selectedPendingSubInCart, onAddPendingSub,
  isProcessing, mobileCartOpen, onCheckout, t,
}: CartPanelProps) {
  return (
    <Card className={mobileCartOpen ? "border-0 rounded-none h-full" : "sticky top-4"}>
      <CardContent className="p-4 flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <h3 className="font-semibold">{t("pos.cart")} ({cart.length})</h3>
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setCart([])}>
              {t("pos.clearCart")}
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0 mb-3">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("pos.emptyCart")}</p>
          ) : (
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.product.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-accent/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {item.product.id.startsWith("__subscription__") && <CreditCard className="h-3 w-3 text-primary shrink-0" />}
                      {item.product.id.startsWith("__renewal__") && <RefreshCw className="h-3 w-3 text-primary shrink-0" />}
                      {item.product.id.startsWith("__dropin__") && <Ticket className="h-3 w-3 text-primary shrink-0" />}
                      <p className="text-sm font-medium truncate">{toUpper(item.product.name)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.product.price)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.product.id.startsWith("__subscription__") || item.product.id.startsWith("__renewal__") ? (
                      <>
                        <Badge variant="secondary" className="text-xs">
                          {item.product.id.startsWith("__renewal__") ? "Renouvellement" : t("pos.subscription")}
                        </Badge>
                        {item.product.id.startsWith("__subscription__") && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditSubscriptionItem(item.product.id)} title={t("pos.editSubscription")}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.product.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.product.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator className="mb-3" />

        <div className="space-y-2 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("pos.subtotal")}</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("pos.discountPercent")}</span>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={discountPercent ?? ""}
                onChange={e => setDiscountPercent(e.target.value ? Number(e.target.value) : null)}
                className="w-16 h-7 text-xs"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("pos.discountAmount")}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{currencySymbol}</span>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={discountAmount ?? ""}
                onChange={e => setDiscountAmount(e.target.value ? Number(e.target.value) : null)}
                className="w-20 h-7 text-xs"
              />
            </div>
          </div>

          {selectedCorporate && subscriptionSubtotal > 0 && (corporateDiscount > 0 || corporateRemoved) && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Badge className="bg-emerald-600">
                  <Building2 className="h-3 w-3" />
                  {selectedCorporate.company_name}
                </Badge>
                <span className="text-xs text-emerald-700 whitespace-nowrap">{t("pos.corporateDiscount")} {Number(selectedCorporate.discount_rate ?? 0)}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-emerald-700">−{formatCurrency(corporateDiscount)}</span>
                {corporateRemoved ? (
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCorporateRemoved(false)} title={t("pos.restoreCorporate")}>
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCorporateRemoved(true)} title={t("pos.removeCorporate")}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}

          <Separator />
          <div className="flex justify-between font-bold text-base">
            <span>{t("pos.total")}</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs font-medium mb-1 block text-muted-foreground">{t("pos.member")}</label>
          <Input
            placeholder={t("pos.searchMember")}
            value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)}
            className="h-8 text-sm mb-1"
          />
          {memberSearch && (
            <div className="max-h-[100px] overflow-y-auto border rounded-md">
              {filteredMembers.slice(0, 5).map(m => (
                <div
                  key={m.id}
                  className={`p-1.5 text-xs cursor-pointer hover:bg-accent truncate ${selectedMemberId === m.id ? "bg-accent font-medium" : ""}`}
                  onClick={() => { setSelectedMemberId(m.id); setMemberSearch(`${toUpper(m.first_name)} ${toUpper(m.last_name)}`) }}
                >
                  {toUpper(m.first_name)} {toUpper(m.last_name)}
                  <span className="text-muted-foreground ml-1">{displayPhone(m.phone)}</span>
                  {m.member_number && <span className="text-muted-foreground ml-1 text-[10px]">({m.member_number})</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedPendingSub && !selectedPendingSubInCart && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <CreditCard className="h-3 w-3 text-primary shrink-0" />
              <span className="text-xs text-foreground truncate">{t("pos.pendingSubscriptionAdd")}</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onAddPendingSub}>
              {t("pos.addPendingSubscription")}
            </Button>
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={cart.length === 0 || isProcessing}
          onClick={onCheckout}
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t("pos.checkout")} — {formatCurrency(total)}
        </Button>
      </CardContent>
    </Card>
  )
})

export default function POSPage() {
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const t = useT()
  const { organization, user } = useAuth()
  const openMember = useOpenMember()
  const location = useLocation()
  const navigate = useNavigate()
  const locationPendingSub = location.state?.pendingSubscription as
    | PendingSubscriptionInfo
    | undefined
  const pendingRenewal = location.state?.pendingRenewal as {
    member_id: string; old_subscription_id: string; member_name: string; subscription_type_id: string; total_amount: number; start_date: string; end_date: string; organization_id: string
  } | undefined
  const [pendingSub, setPendingSub] = useState<PendingSubscriptionInfo | null>(locationPendingSub ?? null)

  const currencySymbol = useMemo(() => {
    try { return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).formatToParts(0).find(p => p.type === 'currency')?.value || 'DA' } catch { return 'DA' }
  }, [])

  const CATEGORIES = ["snacks", "boissons", "complements", "vetements", "equipement", "abonnement"]
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("snacks")
  const [cart, setCart] = useState<CartItem[]>([])
  const [discountPercent, setDiscountPercent] = useState<number | null>(null)
  const [discountAmount, setDiscountAmount] = useState<number | null>(null)
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [amountGiven, setAmountGiven] = useState<number | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [qrInput, setQrInput] = useState("")
  const [panelProductSearch, setPanelProductSearch] = useState("")
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [corporateRemoved, setCorporateRemoved] = useState(false)
  const [editSubId, setEditSubId] = useState<string | null>(null)
  const [editSubTypeId, setEditSubTypeId] = useState("")
  const [editSubStartDate, setEditSubStartDate] = useState("")
  const [newSubOpen, setNewSubOpen] = useState(false)
  const [newSubTypeId, setNewSubTypeId] = useState("")
  const [newSubStartDate, setNewSubStartDate] = useState("")

  const { data: products, isLoading, isError: productsError, error: productsQueryError } = useQuery({
    queryKey: ["products", organization?.id],
    queryFn: async () => {
      if (IS_MOCK) return []
      const { data } = await supabase.from("products").select("*").eq("organization_id", organization?.id!).eq("is_active", true).order("name")
      return data ?? []
    },
    enabled: !!organization?.id,
  })

  const { data: dropInType } = useQuery({
    queryKey: ["subscription-types-dropin", organization?.id],
    queryFn: async () => {
      if (IS_MOCK) return null
      const orgId = organization?.id
      if (!orgId) return null
      const { data } = await supabase.from("subscription_types").select("*").eq("organization_id", orgId).eq("is_drop_in", true).maybeSingle()
      return (data as { id: string; name: string; price: number } | null) ?? null
    },
  })

  const { data: visitorMember } = useQuery({
    queryKey: ["visitor-member", organization?.id],
    queryFn: async () => {
      if (IS_MOCK) return null
      const orgId = organization?.id
      if (!orgId) return null
      const { data } = await supabase.from("members").select("id, first_name, last_name").eq("organization_id", orgId).eq("member_number", "QLF-VISITEUR").maybeSingle()
      return data ?? null
    },
  })

  useEffect(() => {
    if (productsError && productsQueryError) {
      toast({ title: t("errors.generic") || "Error", description: productsQueryError.message, variant: "destructive" })
    }
  }, [productsError, productsQueryError])

  useEffect(() => {
    if (locationPendingSub) {
      window.history.replaceState({}, "")
      setPendingSub(locationPendingSub)
    }
  }, [locationPendingSub])

  useEffect(() => {
    if (pendingSub) {
      setCart(prev => {
        const id = `__subscription__${pendingSub.subscription_id}`
        if (prev.some(item => item.product.id === id)) return prev
        return [...prev, {
          product: {
            id,
            organization_id: pendingSub.organization_id,
            name: pendingSub.subscription_name,
            category: null,
            brand: null,
            sku: null,
            reference: null,
            price: pendingSub.total_amount,
            cost: null,
            stock: null,
            stock_initial: 0,
            image_url: null,
            barcode: null,
            is_active: true,
            created_at: "",
          },
          quantity: 1,
        }]
      })
      setSelectedMemberId(pendingSub.member_id)
      setMemberSearch(`${toUpper(pendingSub.first_name)} ${toUpper(pendingSub.last_name)}`)
    }
  }, [pendingSub])

  useEffect(() => {
    if (pendingRenewal) {
      window.history.replaceState({}, "")
      setCart([{
        product: {
          id: `__renewal__${pendingRenewal.old_subscription_id}`,
          organization_id: pendingRenewal.organization_id,
          name: `Renouvellement - ${pendingRenewal.member_name}`,
          category: null,
          brand: null,
          sku: null,
          reference: null,
          price: pendingRenewal.total_amount,
          cost: null,
          stock: null,
          stock_initial: 0,
          image_url: null,
          barcode: null,
          is_active: true,
          created_at: "",
        },
        quantity: 1,
      }])
      setSelectedMemberId(pendingRenewal.member_id)
      setMemberSearch(pendingRenewal.member_name.toUpperCase())
    }
  }, [pendingRenewal])

  useEffect(() => {
    setCorporateRemoved(false)
  }, [selectedMemberId])

  const { data: members } = useQuery({
    queryKey: ["members_minimal", organization?.id],
    queryFn: async () => {
      if (IS_MOCK) return []
      const orgId = organization?.id
      if (!orgId) return []
      const { data } = await supabase.from("members").select("id, first_name, last_name, phone, photo_url, member_number, corporate_id").eq("status", "active").eq("organization_id", orgId).order("first_name")
      return data ?? []
    },
    enabled: !!organization?.id,
  })

  const { data: corporateAccounts } = useQuery({
    queryKey: ["corporate-accounts", organization?.id],
    queryFn: async () => {
      if (IS_MOCK) return []
      const orgId = organization?.id
      if (!orgId) return []
      const { data } = await supabase.from("corporate").select("id, company_name, discount_rate, is_active, contract_start, contract_end").eq("organization_id", orgId)
      return data ?? []
    },
  })

  // Abonnements en attente de paiement (status pending_payment) — permet de
  // retrouver depuis le panier un abonnement créé mais non payé (même après
  // refresh, quand location.state a été vidé), et de le modifier avant paiement.
  const { data: pendingSubs } = useQuery({
    queryKey: ["pos-pending-subscriptions", organization?.id],
    queryFn: async () => {
      if (IS_MOCK) return []
      const orgId = organization?.id
      if (!orgId) return []
      const { data } = await supabase.from("member_subscriptions")
        .select("id, member_id, subscription_type_id, start_date, end_date, total_amount, subscription_types(name, price, duration_days)")
        .eq("organization_id", orgId)
        .eq("status", "pending_payment")
      return (data as unknown as PendingSubRow[]) ?? []
    },
    enabled: !IS_MOCK && !!organization?.id,
  })

  // Tous les types d'abonnement (pour le dialog de modification d'un abo en attente)
  const { data: subscriptionTypes } = useQuery({
    queryKey: ["subscription-types-pos", organization?.id],
    queryFn: async () => {
      if (IS_MOCK) return []
      const orgId = organization?.id
      if (!orgId) return []
      const { data } = await supabase.from("subscription_types").select("id, name, price, duration_days, is_drop_in").eq("organization_id", orgId).order("name")
      return (data as { id: string; name: string; price: number; duration_days: number; is_drop_in?: boolean | null }[]) ?? []
    },
    enabled: !IS_MOCK && !!organization?.id,
  })

  const { data: selectedMemberDetails } = useQuery({
    queryKey: ["member_details_pos", selectedMemberId, organization?.id],
    queryFn: async () => {
      if (IS_MOCK) return null
      if (!selectedMemberId || !organization?.id) return null
      const { data: member } = await supabase.from("members").select("id, first_name, last_name, phone, photo_url, member_number, corporate_id").eq("id", selectedMemberId).eq("organization_id", organization.id).single()
      if (!member) return null
      const { data: sub } = await supabase.from("member_subscriptions").select("status, start_date, end_date, subscription_types(name)").eq("member_id", selectedMemberId).eq("organization_id", organization.id).eq("status", "active").maybeSingle()
      return { ...member, subscription: sub as { status: string; start_date: string; end_date: string; subscription_types: { name: string } | null } | null ?? null }
    },
    enabled: !IS_MOCK && !!selectedMemberId && !!organization?.id,
  })

  const filteredProducts = useMemo(() => {
    if (!products) return []
    return products.filter((p: Product) => {
      const matchesCategory = p.category?.toLowerCase() === category || (!p.category && category === "snacks")
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    }).sort((a: Product, b: Product) => a.name.localeCompare(b.name))
  }, [products, category, search])

  const { page, setPage, totalPages, paginatedData: paginatedProducts } = usePagination(filteredProducts, 20)

  // Réinitialise la pagination quand la catégorie ou la recherche change :
  // sinon la page courante peut dépasser le nombre de pages de la nouvelle
  // liste et la grille s'affiche vide.
  useEffect(() => { setPage(0) }, [category, search])

  const { exportCsv } = useExportCsv(
    filteredProducts.map((p: Product) => ({ name: p.name, category: p.category ?? '', price: p.price, stock: p.stock ?? 0, barcode: p.barcode ?? '' })),
    'products',
    [
      { key: 'name', label: t('pos.productName') || 'Product' },
      { key: 'category', label: t('pos.category') || 'Category' },
      { key: 'price', label: t('pos.price') || 'Price' },
      { key: 'stock', label: t('pos.stock') || 'Stock' },
      { key: 'barcode', label: t('pos.barcode') || 'Barcode' },
    ]
  )

  const panelFilteredProducts = useMemo(() => {
    if (!panelProductSearch || !products) return []
    const q = panelProductSearch.toLowerCase()
    return products.filter((p: Product) =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    )
  }, [products, panelProductSearch])

  const filteredMembers = useMemo(() => {
    if (!members) return []
    return members.filter((m: Member) =>
      !m.member_number?.startsWith("QLF-VISITEUR") &&
      (`${m.first_name} ${m.last_name}`.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.phone && m.phone.includes(memberSearch)))
    )
  }, [members, memberSearch])

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  }, [cart])

  const discountValue = useMemo(() => {
    return Math.round((subtotal * (discountPercent ?? 0) / 100) + (discountAmount ?? 0))
  }, [subtotal, discountPercent, discountAmount])

  const subscriptionSubtotal = useMemo(() => {
    return cart.reduce((sum, item) =>
      (item.product.id.startsWith("__subscription__") || item.product.id.startsWith("__renewal__"))
        ? sum + item.product.price * item.quantity
        : sum, 0)
  }, [cart])

  const selectedCorporate = useMemo(() => {
    const member = members?.find((m: Member) => m.id === selectedMemberId)
    if (!member?.corporate_id || !corporateAccounts) return null
    return corporateAccounts.find((c: Corporate) => c.id === member.corporate_id) ?? null
  }, [members, selectedMemberId, corporateAccounts])

  const corporateDiscount = useMemo(() => {
    if (corporateRemoved || !selectedCorporate || subscriptionSubtotal <= 0) return 0
    if (!selectedCorporate.is_active) return 0
    const today = new Date().toISOString().split('T')[0]
    if (selectedCorporate.contract_start && today < selectedCorporate.contract_start) return 0
    if (selectedCorporate.contract_end && today > selectedCorporate.contract_end) return 0
    return Math.round(subscriptionSubtotal * (Number(selectedCorporate.discount_rate ?? 0) / 100))
  }, [corporateRemoved, selectedCorporate, subscriptionSubtotal])

  const subscriptionPaid = Math.max(0, subscriptionSubtotal - corporateDiscount)

  // Abonnement en attente du membre sélectionné (détecté depuis la base)
  const selectedPendingSub = useMemo<PendingSubRow | null>(() => {
    if (!selectedMemberId || !pendingSubs) return null
    return pendingSubs.find((s: PendingSubRow) => s.member_id === selectedMemberId) ?? null
  }, [pendingSubs, selectedMemberId])

  // True si l'abonnement en attente du membre sélectionné est déjà au panier
  const selectedPendingSubInCart = useMemo(() => {
    if (!selectedPendingSub) return false
    return cart.some(item => item.product.id === `__subscription__${selectedPendingSub.id}`)
  }, [cart, selectedPendingSub])

  // Ajoute l'abonnement en attente au panier (à la demande, pas de surprise)
  function addPendingSubToCart() {
    if (!selectedPendingSub || !organization?.id) return
    const sub = selectedPendingSub
    setPendingSub({
      member_id: sub.member_id,
      subscription_id: sub.id,
      total_amount: sub.total_amount,
      subscription_name: sub.subscription_types?.name ?? t("pos.subscription"),
      organization_id: organization.id,
      first_name: members?.find((m: Member) => m.id === sub.member_id)?.first_name ?? "",
      last_name: members?.find((m: Member) => m.id === sub.member_id)?.last_name ?? "",
    })
  }

  function openEditSubscription(productId: string) {
    const subId = productId.replace("__subscription__", "")
    const sub = pendingSubs?.find((s: PendingSubRow) => s.id === subId)
    if (!sub) return
    setEditSubId(sub.id)
    setEditSubTypeId(sub.subscription_type_id)
    setEditSubStartDate(sub.start_date)
  }

  const editSubscriptionType = useMemo(() => {
    return subscriptionTypes?.find((t: SubscriptionTypeOption) => t.id === editSubTypeId) ?? null
  }, [subscriptionTypes, editSubTypeId])

  const editSubscriptionEndDate = useMemo(() => {
    if (!editSubscriptionType || !editSubStartDate) return ""
    const d = new Date(editSubStartDate)
    d.setDate(d.getDate() + editSubscriptionType.duration_days)
    return d.toISOString().split("T")[0]
  }, [editSubscriptionType, editSubStartDate])

  const updatePendingSubMutation = useMutation({
    mutationFn: async () => {
      if (!editSubId || !editSubTypeId || !editSubStartDate || !organization?.id) throw new Error("Missing data")
      if (IS_MOCK) {
        return { total_amount: editSubscriptionType?.price ?? 0, subscription_name: editSubscriptionType?.name ?? "" }
      }
      const { data, error } = await (supabase.rpc as any)("update_pending_subscription", {
        p_subscription_id: editSubId,
        p_organization_id: organization.id,
        p_member_id: selectedPendingSub?.member_id,
        p_subscription_type_id: editSubTypeId,
        p_start_date: editSubStartDate,
      })
      if (error) throw error
      return data as { total_amount: number; subscription_name: string; start_date: string; end_date: string }
    },
    onSuccess: (data: { total_amount: number; subscription_name: string; start_date: string; end_date: string }) => {
      // Met à jour l'article virtuel dans le panier
      setCart(prev => prev.map(item =>
        item.product.id === `__subscription__${editSubId}`
          ? { ...item, product: { ...item.product, name: data.subscription_name, price: Number(data.total_amount) } }
          : item
      ))
      // Met à jour le pendingSub courant (montant/prix recalculé)
      setPendingSub(prev => prev && prev.subscription_id === editSubId
        ? { ...prev, total_amount: Number(data.total_amount), subscription_name: data.subscription_name }
        : prev)
      setEditSubId(null)
      queryClient.invalidateQueries({ queryKey: ["pos-pending-subscriptions", organization?.id] })
      toast({ title: t("pos.subscriptionUpdated") })
    },
    onError: (err: Error) => toast({ variant: "destructive", title: t("errors.generic"), description: err.message }),
  })

  // --- Création d'un abonnement en attente pour le membre sélectionné ---
  const newSubscriptionType = useMemo(() => {
    return subscriptionTypes?.find((t: SubscriptionTypeOption) => t.id === newSubTypeId) ?? null
  }, [subscriptionTypes, newSubTypeId])

  const newSubscriptionEndDate = useMemo(() => {
    if (!newSubscriptionType || !newSubStartDate) return ""
    const d = new Date(newSubStartDate)
    d.setDate(d.getDate() + newSubscriptionType.duration_days)
    return d.toISOString().split("T")[0]
  }, [newSubscriptionType, newSubStartDate])

  const createPendingSubMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMemberId || !newSubTypeId || !newSubStartDate || !organization?.id) throw new Error("Missing data")
      if (IS_MOCK) {
        const subId = `mock-ps-${crypto.randomUUID()}`
        return {
          member_id: selectedMemberId,
          subscription_id: subId,
          total_amount: newSubscriptionType?.price ?? 0,
          subscription_name: newSubscriptionType?.name ?? "",
          organization_id: organization.id,
          first_name: members?.find((m: Member) => m.id === selectedMemberId)?.first_name ?? "",
          last_name: members?.find((m: Member) => m.id === selectedMemberId)?.last_name ?? "",
        }
      }
      const { data, error } = await (supabase.rpc as any)("create_pending_subscription", {
        p_organization_id: organization.id,
        p_member_id: selectedMemberId,
        p_subscription_type_id: newSubTypeId,
        p_start_date: newSubStartDate,
      })
      if (error) throw error
      return data as PendingSubscriptionInfo
    },
    onSuccess: (data: PendingSubscriptionInfo) => {
      setNewSubOpen(false)
      setPendingSub(data)
      queryClient.invalidateQueries({ queryKey: ["pos-pending-subscriptions", organization?.id] })
      toast({ title: t("pos.subscriptionCreated") })
    },
    onError: (err: Error) => toast({ variant: "destructive", title: t("errors.generic"), description: err.message }),
  })

  function openNewSubscription(typeId: string) {
    if (!selectedMemberId) {
      toast({ title: t("pos.selectMemberFirst"), variant: "destructive" })
      return
    }
    if (selectedPendingSub && !selectedPendingSubInCart) {
      addPendingSubToCart()
      return
    }
    if (selectedPendingSubInCart) {
      toast({ title: t("pos.pendingSubExists") })
      return
    }
    setNewSubTypeId(typeId)
    setNewSubStartDate(new Date().toISOString().split("T")[0])
    setNewSubOpen(true)
  }

  const total = Math.max(0, subtotal - discountValue - corporateDiscount)
  const change = amountGiven != null && amountGiven >= total ? amountGiven - total : 0

  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  function updateQuantity(productId: string, delta: number) {
    setCart(prev => {
      return prev.reduce<CartItem[]>((acc, item) => {
        if (item.product.id !== productId) {
          acc.push(item)
          return acc
        }
        const newQty = item.quantity + delta
        if (newQty <= 0) return acc
        acc.push({ ...item, quantity: newQty })
        return acc
      }, [])
    })
  }

  function removeFromCart(productId: string) {
    if (productId.startsWith("__subscription__")) setPendingSub(null)
    setCart(prev => prev.filter(item => item.product.id !== productId))
  }

  function addDropInSession() {
    if (!dropInType) return
    const visitorId = visitorMember?.id
    setCart(prev => {
      const existing = prev.find(item => item.product.id === `__dropin__${dropInType.id}`)
      if (existing) {
        return prev.map(item =>
          item.product.id === `__dropin__${dropInType.id}` ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, {
        product: {
          id: `__dropin__${dropInType.id}`,
          organization_id: organization?.id ?? "",
          name: dropInType.name,
          category: null,
          brand: null,
          sku: null,
          reference: null,
          price: dropInType.price,
          cost: null,
          stock: null,
          stock_initial: 0,
          image_url: null,
          barcode: null,
          is_active: true,
          created_at: "",
        },
        quantity: 1,
      }]
    })
    if (visitorId) {
      setSelectedMemberId(visitorId)
      setMemberSearch("")
    }
  }

  function handleScan(value: string) {
    if (!value) return
    const trimmed = value.trim().toLowerCase()
    // Try product barcode first
    const product = products?.find((p: Product) => p.barcode && p.barcode.toLowerCase() === trimmed)
    if (product) {
      addToCart(product)
      setQrInput("")
      return
    }
    // Try member phone or id
    const member = members?.find((m: Member) => m.phone && formatPhone(m.phone) === formatPhone(trimmed))
    if (member) {
      setSelectedMemberId(member.id)
      setMemberSearch(`${toUpper(member.first_name)} ${toUpper(member.last_name)}`)
      setQrInput("")
      return
    }
    toast({ title: "Code non reconnu", description: `Aucun produit ou adhérent trouvé pour "${value}"`, variant: "destructive" })
    setQrInput("")
  }

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const orgId = organization?.id
      if (!orgId) throw new Error("No organization")

      if (IS_MOCK) return

      // Vente 100% transactionnelle : décrément du stock produits (articles
      // physiques) + création session/transaction + mouvements de stock sont
      // réalisés atomiquement côté base. Tout échec annule la vente entière.
      const { data: checkoutData, error: checkoutError } = await (supabase.rpc as any)(
        "record_pos_checkout",
        {
          p_organization_id: orgId,
          p_member_id: selectedMemberId,
          p_items: cart.map(item => ({ id: item.product.id, name: item.product.name, price: item.product.price, quantity: item.quantity })),
          p_subtotal: subtotal,
          p_discount: ((discountValue || 0) + (corporateDiscount || 0)) || null,
          p_total: total,
          p_payment_method: paymentMethod,
          p_user_id: user?.id ?? null,
        }
      )
      if (checkoutError) throw checkoutError
      const createdTx = { id: (checkoutData as any)?.transaction_id }

      // Record attendance for drop-in sessions (Visiteur)
      const dropInItems = cart.filter(item => item.product.id.startsWith("__dropin__"))
      if (dropInItems.length > 0 && visitorMember?.id) {
        for (let i = 0; i < dropInItems.reduce((sum, it) => sum + it.quantity, 0); i++) {
          const { error: attError } = await supabase.from("attendance").insert({
            organization_id: orgId,
            member_id: visitorMember.id,
            check_in: new Date().toISOString(),
            type: "check-in",
            source: "manual",
            created_by: user?.id ?? null,
          })
          if (attError) throw attError
        }
      }

      // Finalize renewal or subscription payment if applicable
      if (pendingRenewal) {
        const { error: renewError } = await (supabase.rpc as any)('pay_and_renew', {
          p_old_subscription_id: pendingRenewal.old_subscription_id,
          p_organization_id: orgId,
          p_member_id: pendingRenewal.member_id,
          p_subscription_type_id: pendingRenewal.subscription_type_id,
          p_new_start_date: pendingRenewal.start_date,
          p_new_end_date: pendingRenewal.end_date,
          p_total_amount: subscriptionPaid,
          p_payment_method: paymentMethod,
          p_payment_amount: subscriptionPaid,
        })
        if (renewError) throw renewError
      }
      // Finalise un abonnement en attente UNIQUEMENT si l'article virtuel est
      // réellement au panier (corrige le bug : pendingSub restait actif après
      // suppression de l'article). L'id de l'article porte le subscription_id.
      const subItem = cart.find(item => item.product.id.startsWith("__subscription__"))
      if (subItem) {
        const subId = subItem.product.id.replace("__subscription__", "")
        const pendingRow = pendingSubs?.find((s: PendingSubRow) => s.id === subId)
        const memberId = selectedMemberId ?? pendingRow?.member_id ?? pendingSub?.member_id
        const { error: finalizeError } = await (supabase.rpc as any)('finalize_subscription_payment', {
          p_subscription_id: subId,
          p_organization_id: orgId,
          p_member_id: memberId,
          p_payment_method: paymentMethod,
          p_amount: subscriptionPaid,
        })
        if (finalizeError) throw finalizeError
      }
    },
    onSuccess: async () => {
      setShowCheckout(false)
      setShowSuccess(true)
      setCart([])
      setDiscountPercent(null)
      setDiscountAmount(null)
      setAmountGiven(null)
      setSelectedMemberId(null)
      setMemberSearch("")
      setQrInput("")
      setPanelProductSearch("")
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["inventory"] })
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] })
      queryClient.invalidateQueries({ queryKey: ["subscription-types"] })
      queryClient.invalidateQueries({ queryKey: ["payments"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      queryClient.invalidateQueries({ queryKey: ["pos-pending-subscriptions", organization?.id] })
      const { data: { user } } = await supabase.auth.getUser()
      if (user) queryClient.invalidateQueries({ queryKey: ["member-subscriptions", user.id] })
    },
    onError: (err: Error) => toast({ title: t("errors.generic"), description: err.message, variant: "destructive" }),
  })

  return (
    <div>
      <div className="h-1.5 w-full rounded-full bg-[#14b8a6] mb-4 dark:bg-primary" />
      <PageHeader
        title={t("pos.title")}
        description={t("pos.description")}
        actions={
          <Button variant="outline" onClick={() => exportCsv()}>
            <Download className="mr-2 h-4 w-4" />
            {t("common.export") || "Export"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* QR code / barcode scan input */}
          <div className="mb-2 relative">
            <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("pos.scanBarcode")}
              value={qrInput}
              onChange={e => setQrInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleScan(e.currentTarget.value) }}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("pos.searchProducts")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Tabs value={category} onValueChange={setCategory}>
            <TabsList className="mb-4 flex-wrap h-auto">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat} value={cat}>{t(`pos.${cat}`)}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : category === "abonnement" ? (
            <div>
              {!selectedMemberId && (
                <Card className="mb-3 border-dashed bg-accent/40">
                  <CardContent className="p-3 flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">{t("pos.selectMemberFirst")}</p>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {subscriptionTypes?.filter((st: SubscriptionTypeOption) => !st.is_drop_in).map((st: SubscriptionTypeOption) => (
                  <Card
                    key={st.id}
                    className="cursor-pointer hover:border-primary transition-colors border-dashed bg-primary/5"
                    onClick={() => openNewSubscription(st.id)}
                  >
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <CreditCard className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{toUpper(st.name)}</p>
                          <p className="text-[10px] text-muted-foreground">{st.duration_days} {t("subscriptions.days")}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-primary">{formatCurrency(st.price)}</p>
                        <p className="text-[10px] text-muted-foreground">{t("pos.addSubscription")}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {subscriptionTypes?.filter((st: SubscriptionTypeOption) => !st.is_drop_in).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8 col-span-2">{t("pos.noSubscriptionTypes")}</p>
                )}
              </div>
            </div>
          ) : (
            <>
            {dropInType && (
              <Card
                className="cursor-pointer hover:border-primary transition-colors mb-3 border-dashed bg-primary/5"
                onClick={addDropInSession}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Ticket className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{toUpper(dropInType.name)}</p>
                      <p className="text-[10px] text-muted-foreground">{t("pos.dropInDesc")}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-primary">{formatCurrency(dropInType.price)}</p>
                    <p className="text-[10px] text-muted-foreground">Aucun membre requis</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {paginatedProducts.map(product => (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => addToCart(product)}
                >
                  <CardContent className="p-3">
                    <div className="aspect-square bg-muted rounded-md flex items-center justify-center mb-2">
                      {product.image_url ? (
                        <img src={product.image_url} alt={toUpper(product.name)} className="w-full h-full object-cover rounded-md" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-baseline justify-between gap-1 mt-1">
                      <p className="text-xs font-medium truncate">{toUpper(product.name)}</p>
                      <p className="text-xs font-bold text-primary shrink-0">{formatCurrency(product.price)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} totalItems={filteredProducts.length} pageSize={20} onPageChange={setPage} />
            </>
          )}
        </div>

        {/* Right panel: fixed cart */}
        <div className="hidden lg:block">
          <CartPanel
            cart={cart} setCart={setCart}
            memberSearch={memberSearch} setMemberSearch={setMemberSearch}
            selectedMemberId={selectedMemberId} setSelectedMemberId={setSelectedMemberId}
            discountPercent={discountPercent} setDiscountPercent={setDiscountPercent}
            discountAmount={discountAmount} setDiscountAmount={setDiscountAmount}
            subtotal={subtotal} total={total} currencySymbol={currencySymbol}
            filteredMembers={filteredMembers}
            selectedCorporate={selectedCorporate}
            corporateDiscount={corporateDiscount}
            subscriptionSubtotal={subscriptionSubtotal}
            corporateRemoved={corporateRemoved} setCorporateRemoved={setCorporateRemoved}
            updateQuantity={updateQuantity} removeFromCart={removeFromCart}
            onEditSubscriptionItem={openEditSubscription}
            selectedPendingSub={selectedPendingSub}
            selectedPendingSubInCart={selectedPendingSubInCart}
            onAddPendingSub={addPendingSubToCart}
            isProcessing={checkoutMutation.isPending}
            mobileCartOpen={false} onCheckout={() => setShowCheckout(true)} t={t}
          />
        </div>
      </div>

      {/* Mobile cart FAB + drawer */}
      <div className="lg:hidden fixed bottom-4 right-4 z-40">
        <Button className="h-14 w-14 rounded-full shadow-lg" onClick={() => setMobileCartOpen(true)}>
          <ShoppingCart className="h-6 w-6" />
          {cart.length > 0 && <Badge className="absolute -top-1 -right-1 px-1.5 py-0.5 text-xs">{cart.length}</Badge>}
        </Button>
      </div>
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="right" className="w-[85vw] p-0 sm:max-w-sm">
          <CartPanel
            cart={cart} setCart={setCart}
            memberSearch={memberSearch} setMemberSearch={setMemberSearch}
            selectedMemberId={selectedMemberId} setSelectedMemberId={setSelectedMemberId}
            discountPercent={discountPercent} setDiscountPercent={setDiscountPercent}
            discountAmount={discountAmount} setDiscountAmount={setDiscountAmount}
            subtotal={subtotal} total={total} currencySymbol={currencySymbol}
            filteredMembers={filteredMembers}
            selectedCorporate={selectedCorporate}
            corporateDiscount={corporateDiscount}
            subscriptionSubtotal={subscriptionSubtotal}
            corporateRemoved={corporateRemoved} setCorporateRemoved={setCorporateRemoved}
            updateQuantity={updateQuantity} removeFromCart={removeFromCart}
            onEditSubscriptionItem={openEditSubscription}
            selectedPendingSub={selectedPendingSub}
            selectedPendingSubInCart={selectedPendingSubInCart}
            onAddPendingSub={addPendingSubToCart}
            isProcessing={checkoutMutation.isPending}
            mobileCartOpen={mobileCartOpen} onCheckout={() => setShowCheckout(true)} t={t}
          />
        </SheetContent>
      </Sheet>

      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingRenewal ? "Renouvellement" : pendingSub ? t("pos.finalizeSubscription") : t("pos.payment")}</DialogTitle>
            <DialogDescription>{pendingRenewal ? "Paiement du renouvellement d'abonnement" : pendingSub ? t("pos.subscriptionPaymentDesc") : t("pos.selectPaymentMethod")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-3xl font-bold">{formatCurrency(total)}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("pos.amountGiven")}</label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={amountGiven ?? ""}
                  onChange={e => setAmountGiven(e.target.value ? Number(e.target.value) : null)}
                  className="pr-12 h-9"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{t("pos.cash")}</span>
              </div>
            </div>
            {change > 0 && (
              <div className="flex justify-between items-center p-2 bg-success/10 rounded-md">
                <span className="text-sm font-medium text-success">{t("pos.changeDue")}</span>
                <span className="text-lg font-bold text-success">{formatCurrency(change)}</span>
              </div>
            )}
            <Separator />
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("pos.paymentMethod")}</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("pos.cash")}</SelectItem>
                  <SelectItem value="card">{t("pos.card")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckout(false)}>{t("pos.cancel")}</Button>
            <Button onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending}>
              {checkoutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("pos.confirmPayment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modifier un abonnement en attente (correction d'erreur avant paiement) */}
      <Dialog open={!!editSubId} onOpenChange={(open) => { if (!open) setEditSubId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pos.editSubscription")}</DialogTitle>
            <DialogDescription>{t("pos.editSubscriptionDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("pos.subscriptionType")}</label>
              <Select value={editSubTypeId} onValueChange={setEditSubTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subscriptionTypes?.map((st: SubscriptionTypeOption) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name} — {formatCurrency(st.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("pos.startDate")}</label>
              <Input
                type="date"
                value={editSubStartDate}
                onChange={e => setEditSubStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            {editSubscriptionType && editSubStartDate && (
              <div className="flex justify-between text-sm p-2 rounded-md bg-muted">
                <span className="text-muted-foreground">{t("pos.endDate")}</span>
                <span className="font-medium">{editSubscriptionEndDate || "—"}</span>
              </div>
            )}
            {editSubscriptionType && (
              <div className="flex justify-between text-sm p-2 rounded-md bg-muted">
                <span className="text-muted-foreground">{t("pos.total")}</span>
                <span className="font-semibold">{formatCurrency(editSubscriptionType.price)}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSubId(null)}>{t("pos.cancel")}</Button>
            <Button onClick={() => updatePendingSubMutation.mutate()} disabled={updatePendingSubMutation.isPending || !editSubTypeId || !editSubStartDate}>
              {updatePendingSubMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("pos.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ajouter un abonnement au membre sélectionné */}
      <Dialog open={newSubOpen} onOpenChange={setNewSubOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pos.addSubscription")}</DialogTitle>
            <DialogDescription>{t("pos.addSubscriptionDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              {selectedMemberDetails ? (
                <button
                  type="button"
                  onClick={() => openMember(selectedMemberDetails.id)}
                  title="Ouvrir la fiche adhérent"
                  className="cursor-pointer hover:text-primary hover:underline transition-colors"
                >
                  {toUpper(selectedMemberDetails.first_name)} {toUpper(selectedMemberDetails.last_name)}
                </button>
              ) : selectedMemberId}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("pos.subscriptionType")}</label>
              <Select value={newSubTypeId} onValueChange={setNewSubTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                {subscriptionTypes?.filter((st: SubscriptionTypeOption) => !st.is_drop_in).map((st: SubscriptionTypeOption) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name} — {formatCurrency(st.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("pos.startDate")}</label>
              <Input
                type="date"
                value={newSubStartDate}
                onChange={e => setNewSubStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            {newSubscriptionType && newSubStartDate && (
              <div className="flex justify-between text-sm p-2 rounded-md bg-muted">
                <span className="text-muted-foreground">{t("pos.endDate")}</span>
                <span className="font-medium">{newSubscriptionEndDate || "—"}</span>
              </div>
            )}
            {newSubscriptionType && (
              <div className="flex justify-between text-sm p-2 rounded-md bg-muted">
                <span className="text-muted-foreground">{t("pos.total")}</span>
                <span className="font-semibold">{formatCurrency(newSubscriptionType.price)}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSubOpen(false)}>{t("pos.cancel")}</Button>
            <Button onClick={() => createPendingSubMutation.mutate()} disabled={createPendingSubMutation.isPending || !newSubTypeId || !newSubStartDate}>
              {createPendingSubMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("pos.addSubscription")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-success" />
                </div>
                {t("pos.success")}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="text-center text-sm text-muted-foreground">
            {pendingRenewal ? "Renouvellement enregistre avec succes" : pendingSub ? t("pos.subscriptionPaymentDesc") : t("pos.successMessage")}
          </div>
          <DialogFooter className="justify-center">
            {pendingRenewal ? (
              <Button onClick={() => { setShowSuccess(false); navigate("/members") }}>{t("pos.newSale")}</Button>
            ) : pendingSub ? (
              <Button onClick={() => { setShowSuccess(false); navigate("/members") }}>{t("pos.newSale")}</Button>
            ) : (
              <Button onClick={() => setShowSuccess(false)}>{t("pos.newSale")}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}