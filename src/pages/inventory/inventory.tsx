import { useState, useRef, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
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
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { useT } from "@/i18n"
import { toUpper } from "../../lib/utils"
import {
  Package, Plus, Search, Edit, Trash2, AlertTriangle, Loader2, Download, Camera, ImageIcon, X, Clock, ArrowDownCircle, ArrowUpCircle,
} from "lucide-react"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { Pagination } from "@/components/ui/pagination"
import { Card } from "@/components/ui/card"
import { computeStockSummary } from "@/lib/stock"

interface InventoryItem {
  id: string
  name: string
  category: string
  quantity: number
  stock_initial: number
  unit: string
  min_stock: number
  price: number
  product_id: string | null
  image_url: string | null
}

interface StockMovementLine {
  id: string
  inventory_id: string
  product_id: string | null
  type: "in" | "out"
  quantity: number
  unit_price: number | null
  reference: string | null
  movement_date: string
  reason: string | null
  notes: string | null
  created_at: string
}

const inventorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  quantity: z.coerce.number().min(0, "Min 0"),
  stock_initial: z.coerce.number().min(0, "Min 0"),
  unit: z.string().min(1, "Unit is required"),
  min_stock: z.coerce.number().min(0, "Min 0"),
  price: z.coerce.number().min(0, "Min 0"),
  image_url: z.string().optional().or(z.literal("")),
})

type InventoryForm = z.infer<typeof inventorySchema>

export default function InventoryPage() {
  const t = useT()
  const { toast } = useToast()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization } = useAuth()
  const orgId = organization?.id
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState<InventoryItem | null>(null)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["inventory", orgId],
    queryFn: async (): Promise<InventoryItem[]> => {
      if (!orgId) return []
      const { data } = await supabase
        .from("inventory")
        .select("*")
        .eq("organization_id", orgId)
        .order("name")
      return (data ?? []) as any[]
    },
    enabled: !!orgId,
  })

  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements", orgId],
    queryFn: async (): Promise<StockMovementLine[]> => {
      if (!orgId) return []
      const { data } = await supabase
        .from("stock_movements")
        .select("id, inventory_id, product_id, type, quantity, unit_price, reference, movement_date, reason, notes, created_at")
        .eq("organization_id", orgId)
      return (data ?? []) as StockMovementLine[]
    },
    enabled: !!orgId,
  })

  const { data: anomalies = [] } = useQuery({
    queryKey: ["stock_anomalies", orgId],
    queryFn: async (): Promise<{ inventory_id: string }[]> => {
      if (!orgId) return []
      const { data } = await supabase
        .from("stock_anomalies")
        .select("inventory_id")
        .eq("organization_id", orgId)
        .eq("status", "open")
      return (data ?? []) as { inventory_id: string }[]
    },
    enabled: !!orgId,
  })

  const anomalyIds = useMemo(() => new Set(anomalies.map((a: { inventory_id: string }) => a.inventory_id)), [anomalies])

  const movementsByItem = useMemo(() => {
    const map = new Map<string, StockMovementLine[]>()
    for (const m of movements) {
      const arr = map.get(m.inventory_id) ?? []
      arr.push(m)
      map.set(m.inventory_id, arr)
    }
    return map
  }, [movements])

  const historyMovements = useMemo(() => {
    if (!historyItem) return []
    const all = movementsByItem.get(historyItem.id) ?? []
    const sorted = [...all].sort((a, b) => {
      const da = a.movement_date || a.created_at
      const db = b.movement_date || b.created_at
      return da.localeCompare(db)
    })
    let running = historyItem.stock_initial ?? 0
    return sorted.map((m) => {
      const stockBefore = running
      running += m.type === "in" ? m.quantity : -m.quantity
      return { ...m, stockBefore, stockAfter: running }
    })
  }, [historyItem, movementsByItem])

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization")
      const { data } = await (supabase.rpc as any)("check_stock_consistency", { p_organization_id: orgId })
      return data as unknown[]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock_anomalies", orgId] })
      queryClient.invalidateQueries({ queryKey: ["inventory", orgId] })
      toast({ title: t("inventory.consistencyChecked") || "Consistency checked" })
    },
    onError: (err: Error) => toast({ title: t("errors.error") || "Error", description: err.message, variant: "destructive" }),
  })

  function getSummary(item: InventoryItem) {
    return computeStockSummary(item.stock_initial ?? 0, movementsByItem.get(item.id) ?? [])
  }

  const form = useForm<InventoryForm>({
    resolver: zodResolver(inventorySchema),
    defaultValues: { name: "", category: "", quantity: 0, stock_initial: 0, unit: "pcs", min_stock: 0, price: 0, image_url: "" },
  })

  const filtered = items.filter((i: InventoryItem) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase())
  )

  const { page, setPage, totalPages, paginatedData: paginatedItems } = usePagination(filtered, 20)

  const { exportCsv } = useExportCsv(
    filtered.map((i: InventoryItem) => ({ name: i.name, category: i.category, stock_initial: i.stock_initial, quantity: i.quantity, unit: i.unit, min_stock: i.min_stock, price: i.price })),
    'inventory',
    [
      { key: 'name', label: t('inventory.name') },
      { key: 'category', label: t('inventory.category') },
      { key: 'stock_initial', label: t('inventory.stockInitial') || 'Stock initial' },
      { key: 'quantity', label: t('inventory.quantity') },
      { key: 'unit', label: t('inventory.unit') },
      { key: 'min_stock', label: t('inventory.minStock') },
      { key: 'price', label: t('inventory.price') },
    ]
  )

  const upsertMutation = useMutation({
    mutationFn: async (values: InventoryForm) => {
      if (!orgId) throw new Error("No organization")
      // S4 : une fiche liée à un produit (product_id) voit son stock piloté par le
      // produit — on ne doit pas écraser quantity/stock_initial manuellement.
      const linked = !!editing?.product_id
      const payload: any = {
        name: values.name,
        category: values.category,
        unit: values.unit,
        min_stock: values.min_stock,
        price: values.price,
        image_url: values.image_url || null,
        ...(linked ? {} : { quantity: values.quantity, stock_initial: values.stock_initial }),
      }
      if (editing) {
        const { error } = await supabase.from("inventory").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("inventory").insert({ ...payload, organization_id: orgId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", orgId] })
      toast({ title: editing ? t("common.updated") : t("common.created") })
      setDialogOpen(false)
      setEditing(null)
      form.reset()
    },
    onError: (err: Error) => toast({ title: t("errors.error"), description: err.message, variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("No organization")
      // S5 : la FK stock_movements.inventory_id est ON DELETE CASCADE — supprimer
      // une fiche avec historique détruirait le ledger. On refuse explicitement.
      const { count } = await supabase
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("inventory_id", id)
      if (count && count > 0) {
        throw new Error(t("inventory.deleteBlocked") || "Cannot delete: stock movements exist for this item")
      }
      const { error } = await supabase.from("inventory").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", orgId] })
      toast({ title: t("common.deleted") })
      setDeleteOpen(false)
      setDeleting(null)
    },
    onError: (err: Error) => toast({ title: t("errors.error"), description: err.message, variant: "destructive" }),
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", category: "", quantity: 0, stock_initial: 0, unit: "pcs", min_stock: 0, price: 0, image_url: "" })
    setDialogOpen(true)
  }

  function openEdit(item: InventoryItem) {
    setEditing(item)
    form.reset({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      stock_initial: item.stock_initial,
      unit: item.unit,
      min_stock: item.min_stock,
      price: item.price,
      image_url: item.image_url ?? "",
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
    form.setValue('image_url', '')
  }

  function onSubmit(values: InventoryForm) {
    upsertMutation.mutate(values)
  }

  return (
    <div>
      <PageHeader
        title={t("inventory.title")}
        description={t("inventory.description")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportCsv()}>
              <Download className="mr-2 h-4 w-4" />
              {t("common.export") || "Export"}
            </Button>
            <Button variant="outline" onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
              {verifyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
              {t("inventory.checkConsistency") || "Check consistency"}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> {t("inventory.add")}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("inventory.name")}</TableHead>
              <TableHead>{t("inventory.category")}</TableHead>
              <TableHead className="text-right">{t("inventory.stockInitial") || "Stock initial"}</TableHead>
              <TableHead className="text-right">{t("inventory.totalIn") || "Entrées"}</TableHead>
              <TableHead className="text-right">{t("inventory.totalOut") || "Sorties"}</TableHead>
              <TableHead className="text-right">{t("inventory.quantity")}</TableHead>
              <TableHead>{t("inventory.unit")}</TableHead>
              <TableHead className="text-right">{t("inventory.minStock")}</TableHead>
              <TableHead className="text-right">{t("inventory.price")}</TableHead>
              <TableHead>{t("inventory.image") || "Image"}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginatedItems.map((item) => {
              const lowStock = item.quantity <= item.min_stock
              const summary = getSummary(item)
              const hasAnomaly = anomalyIds.has(item.id) || summary.expected !== item.quantity
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {toUpper(item.name)}
                      {lowStock && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {t("inventory.lowStock")}
                        </Badge>
                      )}
                      {hasAnomaly && (
                        <Badge variant="outline" className="gap-1 border-destructive text-destructive">
                          <AlertTriangle className="h-3 w-3" /> {t("inventory.anomaly") || "Anomalie"}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{toUpper(item.category)}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{summary.stockInitial}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600">+{summary.totalIn}</TableCell>
                  <TableCell className="text-right font-mono text-red-600">-{summary.totalOut}</TableCell>
                  <TableCell className="text-right font-mono">{summary.expected}</TableCell>
                  <TableCell>{toUpper(item.unit)}</TableCell>
                  <TableCell className="text-right">{item.min_stock}</TableCell>
                  <TableCell className="text-right">{item.price.toLocaleString()} DA</TableCell>
                  <TableCell>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-md object-cover border border-border" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setHistoryItem(item)} title={t("inventory.stockHistory") || "Historique"}>
                        <Clock className="h-4 w-4" />
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
              )
            })}
            {!isLoading && paginatedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="md:hidden space-y-3 p-4">
        {!isLoading && paginatedItems.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">{t("common.noResults")}</p>
        ) : (
          paginatedItems.map(item => {
            const lowStock = item.quantity <= item.min_stock
            const summary = getSummary(item)
            const hasAnomaly = anomalyIds.has(item.id) || summary.expected !== item.quantity
            return (
              <Card key={item.id} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-md object-cover border border-border" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-medium">{toUpper(item.name)}</span>
                  {lowStock && (
                    <Badge variant="destructive" className="gap-1 ml-auto">
                      <AlertTriangle className="h-3 w-3" /> {t("inventory.lowStock")}
                    </Badge>
                  )}
                  {hasAnomaly && (
                    <Badge variant="outline" className="gap-1 border-destructive text-destructive ml-auto">
                      <AlertTriangle className="h-3 w-3" /> {t("inventory.anomaly") || "Anomalie"}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground"><Badge variant="outline">{toUpper(item.category)}</Badge></p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("inventory.stockInitial") || "Initial"}: {summary.stockInitial} | +{summary.totalIn} | -{summary.totalOut} | {t("inventory.finalStock") || "Final"}: {summary.expected} {toUpper(item.unit)}
                </p>
                <p className="text-sm text-muted-foreground">{t("inventory.price")}: {item.price.toLocaleString()} DA</p>
                <div className="flex justify-end gap-1 mt-2">
                  <Button variant="ghost" size="icon" onClick={() => setHistoryItem(item)} title={t("inventory.stockHistory") || "Historique"}>
                    <Clock className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setDeleting(item); setDeleteOpen(true) }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            )
          })
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={20} onPageChange={setPage} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("inventory.edit") : t("inventory.add")}</DialogTitle>
            <DialogDescription>{t("inventory.formDescription")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.name")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.category")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="unit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.unit")}</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pcs">Pieces</SelectItem>
                          <SelectItem value="kg">Kilograms</SelectItem>
                          <SelectItem value="L">Liters</SelectItem>
                          <SelectItem value="box">Box</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.quantity")}</FormLabel>
                    <FormControl><Input type="number" min={0} disabled={!!editing?.product_id} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="stock_initial" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.stockInitial") || "Stock initial"}</FormLabel>
                    <FormControl><Input type="number" min={0} disabled={!!editing?.product_id} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="min_stock" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.minStock")}</FormLabel>
                    <FormControl><Input type="number" min={0} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="price" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.price")}</FormLabel>
                  <FormControl><Input type="number" min={0} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="image_url" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.image") || "Image"}</FormLabel>
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
                          {imageUploading ? t("common.uploading") || "Uploading..." : t("inventory.uploadImage") || "Upload Image"}
                        </button>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={upsertMutation.isPending}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inventory.confirmDelete") || "Confirm Delete"}</DialogTitle>
            <DialogDescription>
              {t("inventory.deleteWarning") || "Are you sure you want to delete"} <strong>{toUpper(deleting?.name)}</strong>? {t("inventory.deleteWarning2") || "This action cannot be undone."}
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

      <Dialog open={!!historyItem} onOpenChange={(open) => { if (!open) setHistoryItem(null) }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("inventory.stockHistory") || "Historique de stock"} — {historyItem ? toUpper(historyItem.name) : ""}
            </DialogTitle>
            <DialogDescription>{historyItem ? `${toUpper(historyItem.category)} · ${toUpper(historyItem.unit)}` : ""}</DialogDescription>
          </DialogHeader>

          {historyItem && (() => {
            const summary = getSummary(historyItem)
            return (
              <div className="overflow-y-auto flex-1 min-h-0 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-md border p-3 text-center">
                    <p className="text-xs text-muted-foreground">{t("inventory.stockInitial") || "Stock initial"}</p>
                    <p className="text-lg font-bold font-mono">{summary.stockInitial}</p>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <p className="text-xs text-muted-foreground">{t("inventory.totalIn") || "Entrées"}</p>
                    <p className="text-lg font-bold font-mono text-emerald-600">+{summary.totalIn}</p>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <p className="text-xs text-muted-foreground">{t("inventory.totalOut") || "Sorties"}</p>
                    <p className="text-lg font-bold font-mono text-red-600">-{summary.totalOut}</p>
                  </div>
                  <div className="rounded-md border p-3 text-center bg-primary/5">
                    <p className="text-xs text-muted-foreground">{t("inventory.quantity")}</p>
                    <p className="text-lg font-bold font-mono">{summary.expected}</p>
                  </div>
                </div>

                <div className="rounded-md border p-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("inventory.price") || "Prix"}:</span>
                  <span className="font-mono font-bold">{historyItem.price.toLocaleString()} DA</span>
                </div>

                {historyMovements.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">{t("inventory.noMovements") || "Aucun mouvement de stock pour cet article."}</p>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("inventory.movementDate") || "Date"}</TableHead>
                          <TableHead>{t("inventory.movementType") || "Type"}</TableHead>
                          <TableHead className="text-right">{t("inventory.movementQty") || "Quantité"}</TableHead>
                          <TableHead className="text-right">{t("inventory.movementUnitPrice") || "Prix unitaire"}</TableHead>
                          <TableHead className="text-right">{t("inventory.stockBefore") || "Stock avant"}</TableHead>
                          <TableHead className="text-right">{t("inventory.stockAfter") || "Stock après"}</TableHead>
                          <TableHead>{t("inventory.ref") || "Référence"}</TableHead>
                          <TableHead>{t("inventory.movementReason") || "Motif"}</TableHead>
                          <TableHead>{t("inventory.movementNotes") || "Notes"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyMovements.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {m.movement_date ? format(new Date(m.movement_date), "dd/MM/yyyy", { locale: fr }) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={m.type === "in" ? "default" : "destructive"} className="gap-1">
                                {m.type === "in" ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                                {m.type === "in" ? (t("inventory.entry") || "Entrée") : (t("inventory.exit") || "Sortie")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <span className={m.type === "in" ? "text-emerald-600" : "text-red-600"}>
                                {m.type === "in" ? "+" : "-"}{m.quantity}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {m.unit_price != null ? `${m.unit_price.toLocaleString()} DA` : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">{m.stockBefore}</TableCell>
                            <TableCell className="text-right font-mono font-bold">{m.stockAfter}</TableCell>
                            <TableCell className="text-sm">{m.reference || "—"}</TableCell>
                            <TableCell className="text-sm">{m.reason || "—"}</TableCell>
                            <TableCell className="text-sm max-w-[150px] truncate" title={m.notes || ""}>{m.notes || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
