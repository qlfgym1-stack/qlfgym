import { useState, useRef, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { useT } from "@/i18n"
import { toUpper, formatCurrency, formatDate } from "../../lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Package, Plus, Search, Edit, Trash2, Loader2, Download, Upload, Camera, ImageIcon, X, DollarSign, ShoppingCart, TrendingUp,
  ArrowDownToLine, ArrowUpFromLine, Clock,
} from "lucide-react"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { Pagination } from "@/components/ui/pagination"
import { Card, CardContent } from "@/components/ui/card"
import { useNavigate } from "react-router-dom"
import type { Product } from "@/types/supabase"

// S7/S9 : normalise une catégorie brute (import Excel, export) vers une valeur
// valide du CHECK constraint — le map renvoie null si introuvable.
const PRODUCT_CATEGORIES = new Set(['snacks', 'boissons', 'complements', 'vetements', 'equipement'])
function normalizeCategory(raw: string): string | null {
  const c = (raw || '').trim().toLowerCase()
  const map: Record<string, string> = {
    snack: 'snacks', snacks: 'snacks',
    boisson: 'boissons', boissons: 'boissons',
    complement: 'complements', complements: 'complements', 'complément': 'complements', 'compléments': 'complements',
    vetement: 'vetements', vetements: 'vetements', 'vêtement': 'vetements', 'vêtements': 'vetements', 'vÃªtements': 'vetements',
    equipement: 'equipement', equipements: 'equipement', 'équipement': 'equipement', 'équipements': 'equipement', 'Ã©quipement': 'equipement',
  }
  return map[c] ?? null
}

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  brand: z.string().optional().or(z.literal("")),
  reference: z.string().optional().or(z.literal("")),
  price: z.coerce.number().min(0, "Min 0"),
  cost: z.coerce.number().min(0, "Min 0").optional().or(z.literal("")),
  stock: z.coerce.number().min(0, "Min 0").optional().or(z.literal("")),
  barcode: z.string().optional().or(z.literal("")),
  image_url: z.string().optional().or(z.literal("")),
  is_active: z.boolean().default(true),
})

type ProductForm = z.infer<typeof productSchema>

export default function ProductsPage() {
  const t = useT()
  const { toast } = useToast()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization } = useAuth()
  const orgId = organization?.id
  const [search, setSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState("")
  const [filterBrand, setFilterBrand] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterBarcode, setFilterBarcode] = useState("")
  const [filterPriceMin, setFilterPriceMin] = useState("")
  const [filterPriceMax, setFilterPriceMax] = useState("")
  const [filterCostMin, setFilterCostMin] = useState("")
  const [filterCostMax, setFilterCostMax] = useState("")
  const [filterStockMin, setFilterStockMin] = useState("")
  const [filterStockMax, setFilterStockMax] = useState("")
  const [filterHasImage, setFilterHasImage] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importData, setImportData] = useState<any[]>([])
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [stockDialogOpen, setStockDialogOpen] = useState(false)
  const [stockMode, setStockMode] = useState<"add" | "out">("add")
  const [stockForm, setStockForm] = useState({ quantity: 1, unit_price: "", reference: "", movement_date: "", notes: "" })
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const nav = useNavigate()

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ExcelJS = await import("exceljs")
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const arrayBuf = evt.target?.result as ArrayBuffer
        const wb = new ExcelJS.default.Workbook()
        await wb.xlsx.load(arrayBuf)
        const ws = wb.worksheets[0]
        if (!ws || ws.rowCount === 0) {
          toast({ title: 'Fichier vide', variant: 'destructive' })
          return
        }
        const headerRow = ws.getRow(1)
        const headers: string[] = []
        headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value ?? '').trim()
        })
        const stockCount = headers.filter(h => h.toUpperCase().includes('STOCK')).length
        const rows: Record<string, unknown>[] = []
        for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
          const row = ws.getRow(rowNum)
          if (!row.hasValues) continue
          const obj: Record<string, unknown> = {}
          let stockIdx = 0
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            let key = headers[colNumber - 1] || ''
            if (key.toUpperCase().includes('STOCK') && stockCount > 1) {
              key = stockIdx === 0 ? 'STOCK' : 'STOCK_2'
              stockIdx++
            }
            const val = cell.value
            if (val && typeof val === 'object' && 'richText' in val) {
              obj[key] = (val as any).richText.map((t: any) => t.text).join('')
            } else if (val && typeof val === 'object' && 'text' in val) {
              obj[key] = (val as any).text
            } else {
              obj[key] = val ?? ''
            }
          })
          if (Object.values(obj).some(v => v !== '' && v !== null)) {
            rows.push(obj)
          }
        }
        setImportData(rows)
      } catch (err) {
        toast({ title: 'Erreur de lecture', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleConfirmImport() {
    if (!orgId || importData.length === 0) return
    // S7 : normalisation des catégories (le CHECK de la table n'autorise que
    // snacks/boissons/complements/vetements/equipement — une valeur hors liste
    // rejette l'insert en bloc).
    let invalidCategory = 0
    let products = importData.map(r => {
      const rawCat = String(r.CATEGORY || r.category || '')
      const category = normalizeCategory(rawCat)
      if (rawCat.trim() && (!category || !PRODUCT_CATEGORIES.has(category))) invalidCategory++
      const stock = Number(r.STOCK ?? r.stock ?? r.Stock ?? 0) || null
      return {
        organization_id: orgId,
        name: String(r.NOM || r.nom || r.Name || r.name || '').trim(),
        category: category && PRODUCT_CATEGORIES.has(category) ? category : null,
        brand: String(r.MARQUE || r.marque || r.Brand || r.brand || '').trim() || null,
        reference: String(r['REF*'] || r.REF || r.Ref || r.reference || '').trim() || null,
        price: Number(r['PRICE DA'] ?? r.price ?? r.Price ?? 0),
        cost: Number(r['COST (DA)'] ?? r.cost ?? r.Cost ?? 0) || null,
        stock,
        // S2 : le ledger part de stock_initial = stock importé
        stock_initial: stock || 0,
        barcode: String(r['CODE BARR*'] || r['CODE BARR'] || r.barcode || r.Barcode || '').trim() || null,
        is_active: String(r.STATUS || r.status || '').toLowerCase() === 'inactif' || String(r.STATUS || r.status || '').toLowerCase() === 'inactive' ? false : true,
      }
    })
    const skipped = products.filter(p => !p.name).length
    products = products.filter(p => p.name)
    supabase.from("products").insert(products).then(({ error }) => {
      if (error) {
        toast({ title: t("errors.error") || "Error", description: error.message, variant: "destructive" })
        return
      }
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["inventory", orgId] })
      const extra: string[] = []
      if (skipped) extra.push(`${skipped} ignoré(s) sans nom`)
      if (invalidCategory) extra.push(`${invalidCategory} ligne(s) avec catégorie hors liste`)
      toast({ title: `${products.length} produit(s) importé(s)${extra.length ? ` (${extra.join(', ')})` : ''}` })
      setImportDialogOpen(false)
      setImportData([])
      if (importFileRef.current) importFileRef.current.value = ''
    })
  }

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["products", orgId],
    queryFn: async (): Promise<Product[]> => {
      if (!orgId) return []
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("organization_id", orgId)
        .order("name")
      return (data ?? []) as Product[]
    },
    enabled: !!orgId,
  })

  const { data: stockMovements = [] } = useQuery({
    queryKey: ["stock_movements", orgId, historyProduct?.id],
    queryFn: async () => {
      if (!orgId || !historyProduct) return []
      const { data } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, unit_price, reference, movement_date, reason, notes, created_at")
        .eq("organization_id", orgId)
        .eq("product_id", historyProduct.id)
        .order("movement_date", { ascending: false })
      return (data ?? []) as { id: string; type: "in" | "out"; quantity: number; unit_price: number | null; reference: string | null; movement_date: string; reason: string | null; notes: string | null; created_at: string }[]
    },
    enabled: !!orgId && !!historyProduct,
  })

  const historyMovements = useMemo(() => {
    if (!historyProduct || stockMovements.length === 0) return []
    let running = historyProduct.stock_initial ?? 0
    const sorted = [...stockMovements].sort((a, b) => new Date(a.movement_date).getTime() - new Date(b.movement_date).getTime() || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return sorted.map((m) => {
      const before = running
      running = running + (m.type === "in" ? m.quantity : -m.quantity)
      return { ...m, before, after: running }
    }).reverse()
  }, [historyProduct, stockMovements])

  const { data: productExpenses = [] } = useQuery({
    queryKey: ["product-expenses", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("expenses")
        .select("amount, description, expense_date")
        .eq("organization_id", orgId)
        .eq("category", "products")
        .order("expense_date", { ascending: false })
      return (data ?? []) as { amount: number; description: string; expense_date: string }[]
    },
    enabled: !!orgId,
  })

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", category: "", brand: "", reference: "", price: 0, cost: "", stock: "", barcode: "", image_url: "", is_active: true },
  })

  const stockMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !stockProduct) throw new Error("No product")
      if (stockForm.quantity <= 0) throw new Error("Quantity must be at least 1")
      if (stockMode === "add") {
        const { error } = await (supabase.rpc as any)("record_product_stock_add", {
          p_product_id: stockProduct.id,
          p_quantity: Number(stockForm.quantity),
          p_unit_price: stockForm.unit_price ? Number(stockForm.unit_price) : null,
          p_reference: stockForm.reference || null,
          p_movement_date: stockForm.movement_date || undefined,
          p_notes: stockForm.notes || null,
        })
        if (error) throw error
      } else {
        const { error } = await (supabase.rpc as any)("record_product_stock_out", {
          p_product_id: stockProduct.id,
          p_quantity: Number(stockForm.quantity),
          p_reason: stockForm.notes || "ajustement",
          p_notes: stockForm.reference || null,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["inventory"] })
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] })
      queryClient.invalidateQueries({ queryKey: ["product-expenses"] })
      toast({ title: stockMode === "add" ? (t("products.stockAdded") || "Stock ajouté") : (t("products.stockOutDone") || "Sortie enregistrée") })
      setStockDialogOpen(false)
      setStockProduct(null)
      setStockForm({ quantity: 1, unit_price: "", reference: "", movement_date: "", notes: "" })
    },
    onError: (err: Error) => toast({ title: t("errors.error") || "Error", description: err.message, variant: "destructive" }),
  })

  const categories = [...new Set(items.map((i: Product) => i.category).filter(Boolean))].sort() as string[]
  const brands = [...new Set(items.map((i: Product) => i.brand).filter(Boolean))].sort() as string[]

  const filtered = items.filter((i: Product) => {
    const matchesSearch = !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (i.brand ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (i.barcode ?? "").toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false
    if (filterCategory && i.category !== filterCategory) return false
    if (filterBrand && i.brand !== filterBrand) return false
    if (filterStatus === "active" && !i.is_active) return false
    if (filterStatus === "inactive" && i.is_active) return false
    if (filterBarcode && !(i.barcode ?? "").toLowerCase().includes(filterBarcode.toLowerCase())) return false
    if (filterPriceMin && (i.price ?? 0) < Number(filterPriceMin)) return false
    if (filterPriceMax && (i.price ?? 0) > Number(filterPriceMax)) return false
    if (filterCostMin && (i.cost ?? 0) < Number(filterCostMin)) return false
    if (filterCostMax && (i.cost ?? 0) > Number(filterCostMax)) return false
    if (filterStockMin && (i.stock ?? 0) < Number(filterStockMin)) return false
    if (filterStockMax && (i.stock ?? 0) > Number(filterStockMax)) return false
    if (filterHasImage && !i.image_url) return false
    return true
  })

  const { page, setPage, totalPages, paginatedData: paginatedItems } = usePagination(filtered, 20)

  const totalInventoryValue = items.reduce((sum: number, p: Product) => sum + ((p.cost ?? 0) * (p.stock ?? 0)), 0)
  const totalProductExpenses = productExpenses.reduce((sum: number, e: { amount: number; description: string; expense_date: string }) => sum + (Number(e.amount) || 0), 0)
  const activeProducts = items.filter((p: Product) => p.is_active).length
  const lowStockCount = items.filter((p: Product) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 10).length

  const { exportCsv } = useExportCsv(
    filtered.map((i: Product) => ({
      name: i.name, category: normalizeCategory(i.category ?? '') ?? '', brand: i.brand ?? "",
      price: i.price, cost: i.cost ?? 0, stock: i.stock ?? 0, barcode: i.barcode ?? "", status: i.is_active ? "Active" : "Inactive"
    })),
    'products',
    [
      { key: 'name', label: t('products.name') || 'Name' },
      { key: 'category', label: t('products.category') || 'Category' },
      { key: 'brand', label: t('products.brand') || 'Brand' },
      { key: 'price', label: t('products.price') || 'Price' },
      { key: 'cost', label: t('products.cost') || 'Cost' },
      { key: 'stock', label: t('products.stock') || 'Stock' },
      { key: 'barcode', label: t('products.barcode') || 'Barcode' },
      { key: 'status', label: t('products.status') || 'Status' },
    ]
  )

  const upsertMutation = useMutation({
    mutationFn: async (values: ProductForm) => {
      if (!orgId) throw new Error("No organization")
      const payload: any = {
        name: values.name,
        category: values.category,
        brand: values.brand || null,
        reference: values.reference || null,
        price: values.price,
        cost: values.cost || null,
        barcode: values.barcode || null,
        image_url: values.image_url || null,
        is_active: values.is_active,
      }
      // Le stock n'est JAMAIS modifié à l'édition (ledger obligatoire) :
      // les variations passent par les RPC record_product_stock_add/out.
      if (!editing) {
        payload.stock = values.stock || null
        // S2 : initialise stock_initial au stock saisi pour que le ledger
        // (product_expected_stock = stock_initial + Σ mouvements) reste cohérent.
        payload.stock_initial = values.stock || 0
      }
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("products").insert({ ...payload, organization_id: orgId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["inventory", orgId] })
      toast({ title: editing ? t("common.updated") || "Updated" : t("common.created") || "Created" })
      setDialogOpen(false)
      setEditing(null)
      form.reset()
    },
    onError: (err: Error) => toast({ title: t("errors.error") || "Error", description: err.message, variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["inventory", orgId] })
      toast({ title: t("common.deleted") || "Deleted" })
      setDeleteOpen(false)
      setDeleting(null)
    },
    onError: (err: Error) => toast({ title: t("errors.error") || "Error", description: err.message, variant: "destructive" }),
  })

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) return
      const { error } = await supabase.from("products").delete().eq("organization_id", orgId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["inventory", orgId] })
      toast({ title: 'Tous les produits ont été supprimés' })
      setClearAllOpen(false)
    },
    onError: (err: Error) => toast({ title: t("errors.error") || "Error", description: err.message, variant: "destructive" }),
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", category: "", brand: "", reference: "", price: 0, cost: "", stock: "", barcode: "", image_url: "", is_active: true })
    setDialogOpen(true)
  }

  function openEdit(item: Product) {
    setEditing(item)
    form.reset({
      name: item.name,
      category: item.category ?? "",
      brand: item.brand ?? "",
      reference: item.reference ?? "",
      price: item.price,
      cost: item.cost ?? 0,
      stock: item.stock ?? 0,
      barcode: item.barcode ?? "",
      image_url: item.image_url ?? "",
      is_active: item.is_active,
    })
    setDialogOpen(true)
  }

  async function handleImageUpload(file: File) {
    if (!orgId) return
    setImageUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const filePath = `${orgId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file)
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(filePath)
      form.setValue('image_url', urlData.publicUrl)
    } catch (e) {
      toast({ title: t("errors.error") || "Error", description: e instanceof Error ? e.message : 'Upload failed', variant: "destructive" })
    } finally {
      setImageUploading(false)
    }
  }

  function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleImageUpload(file)
  }

  function clearImage() {
    form.setValue('image_url', "")
  }

  function onSubmit(values: ProductForm) {
    upsertMutation.mutate(values)
  }

  return (
    <div>
      <PageHeader
        title={t("products.title") || "Produits"}
        description={t("products.description") || "Gérer les produits vendables"}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportCsv()}>
              <Download className="mr-2 h-4 w-4" />
              {t("common.export") || "Export"}
            </Button>
            <Button variant="outline" onClick={() => setClearAllOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Vider
            </Button>
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("products.import") || "Import"}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> {t("products.add") || "Add Product"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        <Card className="border border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2.5 bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Produits</p>
              <p className="text-xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">{activeProducts} actifs</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2.5 bg-[#10b981]/10">
              <DollarSign className="h-5 w-5 text-[#10b981]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valeur Stock</p>
              <p className="text-xl font-bold">{formatCurrency(totalInventoryValue)}</p>
              {lowStockCount > 0 && <p className="text-xs text-amber-600">⚠ {lowStockCount} stock bas</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2.5 bg-[#ef4444]/10">
              <TrendingUp className="h-5 w-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dépenses Produits</p>
              <p className="text-xl font-bold">{formatCurrency(totalProductExpenses)}</p>
              <p className="text-xs text-muted-foreground">{productExpenses.length} entrées</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="border border-border/50 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => nav("/expenses?cat=products")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2.5 bg-[#f59e0b]/10">
              <ShoppingCart className="h-5 w-5 text-[#f59e0b]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Voir Dépenses</p>
              <p className="text-sm font-medium">Catégorie Produits →</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher nom, catégorie, marque, réf, code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Catégorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Toutes</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Marque" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Toutes</SelectItem>
              {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="inactive">Inactif</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Code:</span>
            <Input placeholder="Code-barres" value={filterBarcode} onChange={e => setFilterBarcode(e.target.value)} className="h-8 w-[130px]" />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Prix:</span>
            <Input type="number" min="0" placeholder="Min" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)} className="h-8 w-[80px]" />
            <span>—</span>
            <Input type="number" min="0" placeholder="Max" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)} className="h-8 w-[80px]" />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Coût:</span>
            <Input type="number" min="0" placeholder="Min" value={filterCostMin} onChange={e => setFilterCostMin(e.target.value)} className="h-8 w-[80px]" />
            <span>—</span>
            <Input type="number" min="0" placeholder="Max" value={filterCostMax} onChange={e => setFilterCostMax(e.target.value)} className="h-8 w-[80px]" />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Stock:</span>
            <Input type="number" min="0" placeholder="Min" value={filterStockMin} onChange={e => setFilterStockMin(e.target.value)} className="h-8 w-[80px]" />
            <span>—</span>
            <Input type="number" min="0" placeholder="Max" value={filterStockMax} onChange={e => setFilterStockMax(e.target.value)} className="h-8 w-[80px]" />
          </div>
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={filterHasImage} onChange={e => setFilterHasImage(e.target.checked)} className="rounded" />
            Image
          </label>
        </div>
      </div>

      <div className="hidden md:block rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("products.image") || "Image"}</TableHead>
              <TableHead>{t("products.name") || "Name"}</TableHead>
              <TableHead>{t("products.category") || "Category"}</TableHead>
              <TableHead>{t("products.brand") || "Brand"}</TableHead>
              <TableHead className="text-right">{t("products.price") || "Price"}</TableHead>
              <TableHead className="text-right">{t("products.cost") || "Cost"}</TableHead>
              <TableHead className="text-right">{t("products.stock") || "Stock"}</TableHead>
              <TableHead>{t("products.barcode") || "Barcode"}</TableHead>
              <TableHead>{t("products.status") || "Status"}</TableHead>
              <TableHead className="text-right">{t("common.actions") || "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginatedItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-md object-cover border border-border" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    {toUpper(item.name)}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{toUpper(item.category ?? "")}</Badge></TableCell>
                <TableCell className="text-xs">{item.brand ?? "-"}</TableCell>
                <TableCell className="text-right">{item.price.toLocaleString()}</TableCell>
                <TableCell className="text-right">{item.cost ? item.cost.toLocaleString() : "-"}</TableCell>
                <TableCell className="text-right">{item.stock ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs">{item.barcode ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={item.is_active ? "default" : "secondary"}>
                    {item.is_active ? (t("products.active") || "Active") : (t("products.inactive") || "Inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title={t("products.stockAdd") || "Rajouter du stock"} onClick={() => { setStockMode("add"); setStockProduct(item); setStockForm({ quantity: 1, unit_price: item.cost ? String(item.cost) : "", reference: "", movement_date: "", notes: "" }); setStockDialogOpen(true) }}>
                      <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                    </Button>
                    <Button variant="ghost" size="icon" title={t("products.stockOut") || "Sortie / ajustement"} onClick={() => { setStockMode("out"); setStockProduct(item); setStockForm({ quantity: 1, unit_price: "", reference: "", movement_date: "", notes: "" }); setStockDialogOpen(true) }}>
                      <ArrowUpFromLine className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button variant="ghost" size="icon" title={t("products.stockHistory") || "Historique du stock"} onClick={() => { setHistoryProduct(item); setHistoryDialogOpen(true) }}>
                      <Clock className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setDeleting(item); setDeleteOpen(true) }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && paginatedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  {t("common.noResults") || "No results"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="md:hidden space-y-3 p-4">
        {!isLoading && paginatedItems.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">{t("common.noResults") || "No results"}</p>
        ) : (
          paginatedItems.map(item => (
            <Card key={item.id} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-md object-cover border border-border" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium">{toUpper(item.name)}</span>
                <Badge variant={item.is_active ? "default" : "secondary"} className="ml-auto">
                  {item.is_active ? (t("products.active") || "Active") : (t("products.inactive") || "Inactive")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground"><Badge variant="outline">{toUpper(item.category ?? "")}</Badge></p>
              {item.brand && <p className="text-xs text-muted-foreground mt-1">Marque: {item.brand}</p>}
              <p className="text-sm text-muted-foreground mt-1">
                {t("products.price") || "Price"}: {item.price.toLocaleString()}
                {item.cost ? ` | ${t("products.cost") || "Coût"}: ${item.cost.toLocaleString()}` : ""}
                {item.stock != null ? ` | ${t("products.stock") || "Stock"}: ${item.stock}` : ""}
              </p>
              {item.barcode && <p className="text-xs text-muted-foreground font-mono mt-1">{t("products.barcode") || "Barcode"}: {item.barcode}</p>}
              <div className="flex justify-end gap-1 mt-2">
                <Button variant="ghost" size="icon" title={t("products.stockAdd") || "Rajouter du stock"} onClick={() => { setStockMode("add"); setStockProduct(item); setStockForm({ quantity: 1, unit_price: item.cost ? String(item.cost) : "", reference: "", movement_date: "", notes: "" }); setStockDialogOpen(true) }}>
                  <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                </Button>
                <Button variant="ghost" size="icon" title={t("products.stockOut") || "Sortie / ajustement"} onClick={() => { setStockMode("out"); setStockProduct(item); setStockForm({ quantity: 1, unit_price: "", reference: "", movement_date: "", notes: "" }); setStockDialogOpen(true) }}>
                  <ArrowUpFromLine className="h-4 w-4 text-destructive" />
                </Button>
                <Button variant="ghost" size="icon" title={t("products.stockHistory") || "Historique du stock"} onClick={() => { setHistoryProduct(item); setHistoryDialogOpen(true) }}>
                  <Clock className="h-4 w-4 text-blue-600" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => { setDeleting(item); setDeleteOpen(true) }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={20} onPageChange={setPage} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? t("products.edit") || "Edit Product" : t("products.add") || "Add Product"}</DialogTitle>
            <DialogDescription>{t("products.formDescription") || "Fill in the product details"}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="image_url" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.image") || "Image"}</FormLabel>
                  <FormControl>
                    <div>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageFileChange}
                      />
                      {field.value ? (
                        <div className="relative w-32 h-32 rounded-md overflow-hidden border border-border">
                          <img src={field.value} alt="Preview" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={clearImage}
                            className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 hover:bg-background"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={imageUploading}
                          className="flex items-center gap-2 px-4 py-2 rounded-md border border-border hover:bg-accent text-sm"
                        >
                          {imageUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Camera className="h-4 w-4" />
                          )}
                          {imageUploading ? (t("common.uploading") || "Uploading...") : (t("products.uploadImage") || "Upload Image")}
                        </button>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.name") || "Name"}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.category") || "Category"}</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder={t("products.selectCategory") || "Select category"} /></SelectTrigger>
                        <SelectContent>
                          {categories.map(cat => (
                            <SelectItem key={cat} value={cat}>{toUpper(cat)}</SelectItem>
                          ))}
                          <SelectItem value="snacks">Snacks</SelectItem>
                          <SelectItem value="boissons">Boissons</SelectItem>
                          <SelectItem value="complements">Compléments</SelectItem>
                          <SelectItem value="vetements">Vêtements</SelectItem>
                          <SelectItem value="equipement">Équipement</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="brand" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.brand") || "Brand"}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="reference" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.reference") || "Reference"}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="barcode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.barcode") || "Barcode"}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.price") || "Price"}</FormLabel>
                    <FormControl><Input type="number" min={0} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="cost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.cost") || "Cost"}</FormLabel>
                    <FormControl><Input type="number" min={0} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="stock" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.stock") || "Stock"}</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} readOnly={!!editing} className={editing ? "opacity-60 cursor-not-allowed" : ""} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="is_active" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 pt-6">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">{t("products.active") || "Active"}</FormLabel>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={upsertMutation.isPending}>{t("common.cancel") || "Cancel"}</Button>
                <Button type="submit" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("common.save") || "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("products.confirmDelete") || "Confirm Delete"}</DialogTitle>
            <DialogDescription>
              {t("products.deleteWarning") || "Are you sure you want to delete"} <strong>{toUpper(deleting?.name ?? "")}</strong>? {t("products.deleteWarning2") || "This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleting(null) }}>{t("common.cancel") || "Cancel"}</Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete") || "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={(v) => { setImportDialogOpen(v); if (!v) { setImportData([]); if (importFileRef.current) importFileRef.current.value = '' } }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("products.importFromExcel") || "Import from Excel"}</DialogTitle>
            <DialogDescription>{t("products.importDescription") || "Upload an Excel file with product data"}</DialogDescription>
          </DialogHeader>
          {importData.length === 0 ? (
            <div className="py-4">
              <input ref={importFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90" />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{importData.length} ligne(s) trouvée(s)</p>
              <ScrollArea className="h-64 rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 whitespace-nowrap">
                      <th className="text-left p-2 font-medium">Nom</th>
                      <th className="text-left p-2 font-medium">Catégorie</th>
                      <th className="text-left p-2 font-medium">Marque</th>
                      <th className="p-2 font-medium">Réf</th>
                      <th className="text-right p-2 font-medium">Prix</th>
                      <th className="text-right p-2 font-medium">Coût</th>
                      <th className="text-right p-2 font-medium">Stock</th>
                      <th className="p-2 font-medium">Code-barres</th>
                      <th className="p-2 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importData.map((r, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-2 whitespace-nowrap">{String(r.NOM || r.nom || '')}</td>
                        <td className="p-2">{String(r.CATEGORY || r.category || '')}</td>
                        <td className="p-2">{String(r.MARQUE || r.marque || '')}</td>
                        <td className="p-2 font-mono text-xs">{String(r['REF*'] || r.REF || '')}</td>
                        <td className="p-2 text-right">{Number(r['PRICE DA'] ?? 0).toLocaleString()}</td>
                        <td className="p-2 text-right">{r['COST (DA)'] ?? '-'}</td>
                        <td className="p-2 text-right">{r.STOCK ?? '-'}</td>
                        <td className="p-2 font-mono text-xs">{String(r['CODE BARR*'] || '') || '-'}</td>
                        <td className="p-2">{String(r.STATUS || '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setImportData([]); if (importFileRef.current) importFileRef.current.value = '' }}>
                  {t("common.cancel") || "Cancel"}
                </Button>
                <Button onClick={handleConfirmImport}>
                  {t("common.confirm") || "Confirm"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vider le catalogue</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>tous les produits</strong> ({items.length}) ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearAllOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={() => clearAllMutation.mutate()} disabled={clearAllMutation.isPending}>
              {clearAllMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer tout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stockMode === "add"
                ? (t("products.stockAddTitle") || "Rajouter du stock")
                : (t("products.stockOutTitle") || "Sortie de stock")}
            </DialogTitle>
            <DialogDescription>
              {toUpper(stockProduct?.name ?? "")} — {t("products.stock") || "Stock"}: {stockProduct?.stock ?? 0}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("products.quantity") || "Quantité"}</Label>
                <Input type="number" min={1} value={stockForm.quantity}
                  onChange={(e) => setStockForm((f) => ({ ...f, quantity: Number(e.target.value) }))} />
              </div>
              {stockMode === "add" && (
                <div className="grid gap-2">
                  <Label>{t("products.cost") || "Coût unitaire (DA)"}</Label>
                  <Input type="number" min={0} value={stockForm.unit_price}
                    onChange={(e) => setStockForm((f) => ({ ...f, unit_price: e.target.value }))} />
                </div>
              )}
            </div>
            {stockMode === "add" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>{t("products.reference") || "Référence"}</Label>
                    <Input value={stockForm.reference} placeholder="BC-0001 / facture…"
                      onChange={(e) => setStockForm((f) => ({ ...f, reference: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("products.movementDate") || "Date"}</Label>
                    <Input type="date" value={stockForm.movement_date}
                      onChange={(e) => setStockForm((f) => ({ ...f, movement_date: e.target.value }))} />
                  </div>
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label>{stockMode === "add" ? (t("products.notes") || "Notes") : (t("stock.reason") || "Motif")}</Label>
              {stockMode === "add" ? (
                <Input value={stockForm.notes}
                  onChange={(e) => setStockForm((f) => ({ ...f, notes: e.target.value }))} />
              ) : (
                <Select value={stockForm.notes} onValueChange={(v) => setStockForm((f) => ({ ...f, notes: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("stock.selectReason") || "Sélectionner un motif"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perte">{t("stock.reasonPerte") || "Perte"}</SelectItem>
                    <SelectItem value="casse">{t("stock.reasonCasse") || "Casse"}</SelectItem>
                    <SelectItem value="ajustement">{t("stock.reasonAjustement") || "Ajustement"}</SelectItem>
                    <SelectItem value="inventaire">{t("stock.reasonInventaire") || "Inventaire"}</SelectItem>
                    <SelectItem value="transfert">{t("stock.reasonTransfert") || "Transfert"}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialogOpen(false)}>{t("common.cancel") || "Cancel"}</Button>
            <Button onClick={() => stockMutation.mutate()} disabled={stockMutation.isPending}>
              {stockMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {stockMode === "add" ? (t("common.confirm") || "Confirmer") : (t("common.confirm") || "Confirmer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t("products.stockHistory") || "Historique de stock"} — {toUpper(historyProduct?.name ?? "")}
            </DialogTitle>
            <DialogDescription>
              {t("products.stock") || "Stock"} actuel : {historyProduct?.stock ?? 0} · {t("products.stockInitial") || "Stock initial"} : {historyProduct?.stock_initial ?? 0}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            {historyMovements.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("products.noMovements") || "Aucun mouvement de stock"}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("products.movementDate") || "Date"}</TableHead>
                    <TableHead>{t("products.type") || "Type"}</TableHead>
                    <TableHead className="text-right">{t("products.quantity") || "Qté"}</TableHead>
                    <TableHead className="text-right">{t("products.unitPrice") || "Prix unit."}</TableHead>
                    <TableHead className="text-right">{t("products.before") || "Avant"}</TableHead>
                    <TableHead className="text-right">{t("products.after") || "Après"}</TableHead>
                    <TableHead>{t("products.reason") || "Motif"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyMovements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{formatDate(m.movement_date)}</TableCell>
                      <TableCell>
                        <Badge variant={m.type === "in" ? "default" : "destructive"}>
                          {m.type === "in" ? "+" : "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{m.type === "in" ? "+" : "-"}{m.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.unit_price != null ? `${m.unit_price.toLocaleString()} DA` : "-"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.before}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold">{m.after}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.reason ?? m.notes ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
