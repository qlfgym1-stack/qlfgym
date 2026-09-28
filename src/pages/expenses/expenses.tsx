import { useState, useCallback, useMemo, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { useNavigate, useSearchParams } from "react-router-dom"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table"
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select"
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form"
import {
  Card, CardContent,
} from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { downloadWorkbook } from "@/lib/exportWorkbook"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Plus, Download, Upload, Search, Loader2, Trash2, Package, ExternalLink,
} from "lucide-react"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/ui/pagination"
import { formatDate, formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import type { Expense, Product } from "@/types/supabase"
import { IS_MOCK } from '@/lib/config'

const expenseSchema = z.object({
  category: z.enum(["rent", "salaries", "electricity", "water", "equipment", "maintenance", "marketing", "insurance", "taxes", "products"]),
  description: z.string().min(1, "Description is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
  expense_date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
})

type ExpenseFormValues = z.infer<typeof expenseSchema>

const CATEGORIES = ["rent", "salaries", "electricity", "water", "equipment", "maintenance", "marketing", "insurance", "taxes", "products"] as const

interface ImportRow {
  category: string
  description: string
  amount: number
  expense_date: string
  notes: string
}

export default function ExpensesPage() {
  const t = useT()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization } = useAuth()
  const { toast } = useToast()
  const orgId = organization?.id
  const nav = useNavigate()
  const [searchParams] = useSearchParams()

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>(() => searchParams.get("cat") || "all")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importData, setImportData] = useState<ImportRow[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      category: "products",
      description: "",
      amount: 0,
      expense_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  })

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return []
      const { data } = await supabase
        .from("expenses")
        .select("*")
        .eq("organization_id", orgId)
        .order("expense_date", { ascending: false })
      return data as Expense[]
    },
    enabled: !!orgId && !IS_MOCK,
  })

  const { data: products = [] } = useQuery({
    queryKey: ["products", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("products")
        .select("id, name, category, price, cost, stock, is_active")
        .eq("organization_id", orgId)
        .order("name")
      return (data ?? []) as Pick<Product, "id" | "name" | "category" | "price" | "cost" | "stock" | "is_active">[]
    },
    enabled: !!orgId && categoryFilter === "products",
  })

  const addMutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      if (!orgId) throw new Error("No organization")
      if (IS_MOCK) return
      const { error } = await supabase.from("expenses").insert({
        organization_id: orgId,
        category: values.category,
        description: values.description,
        amount: values.amount,
        expense_date: values.expense_date,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] })
      setAddDialogOpen(false)
      form.reset()
      toast({ title: t("expenses.added") })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (IS_MOCK) return
      const { error } = await supabase.from("expenses").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] })
      setDeleteId(null)
      toast({ title: t("expenses.deleted") })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  const filteredExpenses = useMemo(() => {
    return expenses?.filter((e: Expense) => {
      const matchesSearch = e.description.toLowerCase().includes(search.toLowerCase())
      const matchesCategory = categoryFilter === "all" || e.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [expenses, search, categoryFilter])

  const totalAmount = useMemo(() => {
    return (filteredExpenses ?? []).reduce((sum: number, e: Expense) => sum + Number(e.amount), 0)
  }, [filteredExpenses])

  const { page, setPage, totalPages, paginatedData: paginatedExpenses } = usePagination(filteredExpenses, 20)

  const getCategoryLabel = useCallback((cat: string) => {
    const map: Record<string, string> = {
      rent: t("expenses.rent"),
      salaries: t("expenses.salaries"),
      electricity: t("expenses.electricity"),
      water: t("expenses.water"),
      equipment: t("expenses.equipment"),
      maintenance: t("expenses.maintenance"),
      marketing: t("expenses.marketing"),
      insurance: t("expenses.insurance"),
      taxes: t("expenses.taxes"),
      products: t("expenses.products"),
    }
    return map[cat] || cat
  }, [t])

  const handleImportExcel = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ExcelJS = await import("exceljs")
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = new ExcelJS.default.Workbook()
      await wb.xlsx.load(data.buffer)
      const ws = wb.worksheets[0]
      const headers: string[] = []
      ws.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '')
      })
      const json: Record<string, string>[] = []
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        const obj: Record<string, string> = {}
        row.eachCell((cell, colNumber) => {
          obj[headers[colNumber - 1]] = String(cell.value ?? '')
        })
        json.push(obj)
      })
      const rows: ImportRow[] = json.map((r) => {
        const rawAmount = Number(r.amount ?? r.Amount ?? 0)
        return {
          category: String(r.category || r.Category || "products"),
          description: String(r.description || r.Description || ""),
          amount: Number.isNaN(rawAmount) ? 0 : rawAmount,
          expense_date: String(r.expense_date || r.Date || format(new Date(), "yyyy-MM-dd")),
          notes: String(r.notes || r.Notes || ""),
        }
      })
      setImportData(rows)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ""
  }, [])

  const handleConfirmImport = useCallback(async () => {
    if (!orgId) return
    let imported = 0
    let errors = 0
    const userId = (await supabase.auth.getUser()).data.user?.id
    for (const row of importData) {
      if (IS_MOCK) { imported++; continue }
      const catSet = new Set<string>(CATEGORIES)
      const cat = catSet.has(row.category) ? (row.category as ExpenseFormValues["category"]) : "products"
      const { error: insertError } = await supabase.from("expenses").insert({
        organization_id: orgId,
        category: cat,
        description: row.description || "Imported expense",
        amount: row.amount,
        expense_date: row.expense_date,
        created_by: userId,
      })
      if (insertError) { errors++ } else { imported++ }
    }
    queryClient.invalidateQueries({ queryKey: ["expenses"] })
    setImportData([])
    setImportDialogOpen(false)
    toast({ title: errors > 0 ? `${imported} importé(s), ${errors} erreur(s)` : t("expenses.importSuccess") })
  }, [importData, orgId, supabase, queryClient, toast, t])

  const handleExportExcel = useCallback(async () => {
    if (!expenses) return
    const ExcelJS = await import("exceljs")
    const wb = new ExcelJS.default.Workbook()
    const ws = wb.addWorksheet("Dépenses")
    ws.columns = [
      { header: "Catégorie", key: "Catégorie", width: 20 },
      { header: "Description", key: "Description", width: 30 },
      { header: "Montant", key: "Montant", width: 15 },
      { header: "Date", key: "Date", width: 15 },
    ]
    expenses.forEach((e: Expense) => {
      ws.addRow({
        Catégorie: getCategoryLabel(e.category),
        Description: e.description,
        Montant: e.amount,
        Date: formatDate(e.expense_date),
      })
    })
    await downloadWorkbook(wb, "depenses")
  }, [expenses, getCategoryLabel])

  return (
    <div>
      <div className="h-1.5 w-full rounded-full bg-[#ef4444] mb-4 dark:bg-primary" />
      <PageHeader
        title={t("expenses.title")}
        description={t("expenses.desc")}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("common.import")}
            </Button>
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="mr-2 h-4 w-4" />
              {t("common.export")}
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("expenses.new")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader className="shrink-0">
                  <DialogTitle>{t("expenses.new")}</DialogTitle>
                  <DialogDescription>{t("expenses.formDescription")}</DialogDescription>
                </DialogHeader>
                <div className="overflow-y-auto flex-1 -mx-6 px-6">
                  <Form {...form}>
                    <form id="expense-form" onSubmit={form.handleSubmit((v) => addMutation.mutate(v))} className="space-y-4 py-1">
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("expenses.category")}</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue placeholder={t("expenses.selectCategory")} />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((cat) => (
                                  <SelectItem key={cat} value={cat}>
                                    {getCategoryLabel(cat)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("expenses.descLabel")}</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("expenses.amount")}</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="expense_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("expenses.date")}</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                </div>
                <DialogFooter className="shrink-0">
                  <DialogClose asChild>
                    <Button type="button" variant="outline">{t("common.cancel")}</Button>
                  </DialogClose>
                  <Button type="submit" form="expense-form" disabled={addMutation.isPending}>
                    {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("common.save")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("common.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="text-sm font-semibold text-muted-foreground">
              {t("expenses.total")}: {formatCurrency(totalAmount)}
              <span className="mx-2">·</span>
              {(filteredExpenses ?? []).length} {t("expenses.entries")}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={categoryFilter === "all" ? "selected" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
            >
              {t("common.all")}
            </Button>
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                variant={categoryFilter === cat ? "selected" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter(cat)}
              >
                {getCategoryLabel(cat)}
              </Button>
            ))}
          </div>
          {categoryFilter === "products" && (
            <div className="mt-3 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => nav("/products")}>
                <Package className="mr-1 h-4 w-4" />
                Voir le catalogue Produits →
              </Button>
              <span className="text-xs text-muted-foreground">
                {(filteredExpenses ?? []).length} dépenses liées aux produits
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {categoryFilter === "products" ? (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Prix Vente</TableHead>
                      <TableHead className="text-right">Coût</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Aucun produit trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      products.map((p: Pick<Product, "id" | "name" | "category" | "price" | "cost" | "stock" | "is_active">) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-[#ef4444]/10 text-[#ef4444]">
                              {p.category || "-"}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              {p.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(p.price)}</TableCell>
                          <TableCell className="text-right">{p.cost ? formatCurrency(p.cost) : "-"}</TableCell>
                          <TableCell className="text-right">{p.stock ?? "-"}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${p.is_active ? "bg-[#10b981]/10 text-[#10b981]" : "bg-muted text-muted-foreground"}`}>
                              {p.is_active ? "Actif" : "Inactif"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => nav("/products")}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-3 p-4">
                {products.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Aucun produit trouvé</p>
                ) : (
                  products.map((p: Pick<Product, "id" | "name" | "category" | "price" | "cost" | "stock" | "is_active">) => (
                    <Card key={p.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-[#ef4444]/10 text-[#ef4444]">
                            {p.category || "-"}
                          </span>
                          <p className="mt-1 font-medium">{p.name}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav("/products")}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                        <span>Vente: {formatCurrency(p.price)}</span>
                        <span>Coût: {p.cost ? formatCurrency(p.cost) : "-"}</span>
                        <span>Stock: {p.stock ?? "-"}</span>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("expenses.category")}</TableHead>
                      <TableHead>{t("expenses.description")}</TableHead>
                      <TableHead>{t("expenses.amount")}</TableHead>
                      <TableHead>{t("expenses.date")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : paginatedExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {t("expenses.noData")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                              {getCategoryLabel(expense.category)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate">{expense.description}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(expense.amount)}</TableCell>
                          <TableCell>{formatDate(expense.expense_date)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(expense.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3 p-4">
                {isLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </div>
                ) : paginatedExpenses.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">{t("expenses.noData")}</p>
                ) : (
                  paginatedExpenses.map((expense) => (
                    <Card key={expense.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                            {getCategoryLabel(expense.category)}
                          </span>
                          <p className="mt-1 font-medium">{expense.description}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(expense.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-semibold">{formatCurrency(expense.amount)}</span>
                        <span className="text-sm text-muted-foreground">{formatDate(expense.expense_date)}</span>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </>
          )}

          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={totalPages} totalItems={categoryFilter === "products" ? products.length : (filteredExpenses?.length ?? 0)} pageSize={20} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("expenses.confirmDelete")}</DialogTitle>
            <DialogDescription>{t("expenses.deleteWarning")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t("common.import")}</DialogTitle>
            <DialogDescription>{t("expenses.importInstructions")}</DialogDescription>
          </DialogHeader>
          {importData.length === 0 ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportExcel} className="max-w-sm mx-auto" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {importData.length} ligne(s) trouvée(s). Vérifiez les données avant import.
              </p>
              <ScrollArea className="h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("expenses.category")}</TableHead>
                      <TableHead>{t("expenses.description")}</TableHead>
                      <TableHead>{t("expenses.amount")}</TableHead>
                      <TableHead>{t("expenses.date")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{getCategoryLabel(row.category)}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell>{row.amount}</TableCell>
                        <TableCell>{row.expense_date}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportData([])}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleConfirmImport}>
                  {t("common.confirm")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
