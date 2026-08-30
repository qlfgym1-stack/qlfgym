import { useState, useCallback, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Plus, Download, Upload, FileText, Search, Loader2,
} from "lucide-react"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { Pagination } from "@/components/ui/pagination"
import { formatDate, formatCurrency, toUpper, cleanPaymentNotes } from "@/lib/utils"
import { getNextInvoiceNumber } from "@/lib/invoice"
import { InvoiceDialog } from "@/components/ui/invoice-dialog"
import { useOpenMember } from "@/hooks/useOpenMember"
import type { Payment, Member, SubscriptionType } from "@/types/supabase"
import { IS_MOCK } from '@/lib/config'
import { format } from "date-fns"

const paymentSchema = z.object({
  member_id: z.string().min(1, "Member is required"),
  subscription_id: z.string().optional(),
  amount: z.coerce.number().positive("Amount must be positive"),
  payment_method: z.enum(["cash", "card", "transfer", "other"]),
  payment_date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
})

type PaymentFormValues = z.infer<typeof paymentSchema>

const statusBadge: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  pending: "secondary",
  cancelled: "destructive",
}

type PaymentWithRelations = Payment & {
  members: { first_name: string; last_name: string; member_number?: string | null }
  member_subscriptions: { subscription_types: { name: string } } | null
}

interface ImportRow {
  member_name: string
  amount: number
  payment_method: string
  payment_date: string
  notes: string
}

export default function PaymentsPage() {
  const t = useT()
  const openMember = useOpenMember()
  const getMethodLabel = useCallback((method: string) => {
    const map: Record<string, string> = {
      cash: t("payments.cash"),
      card: t("payments.card"),
      transfer: t("payments.transfer"),
      other: t("payments.other"),
    }
    return map[method] || method
  }, [t])
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization } = useAuth()
  const { toast } = useToast()
  const orgId = organization?.id

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [methodFilter, setMethodFilter] = useState<string>("all")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<PaymentWithRelations | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importData, setImportData] = useState<ImportRow[]>([])
  const [memberSearch, setMemberSearch] = useState("")

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      member_id: "",
      subscription_id: "",
      amount: 0,
      payment_method: "cash",
      payment_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  })

  const { data: payments, isLoading, isError: paymentsError, error: paymentsQueryError } = useQuery({
    queryKey: ["payments", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return []
      const { data } = await supabase
        .from("payments")
        .select("id, amount, payment_date, payment_method, status, notes, members!inner(first_name, last_name, member_number)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
      return data as PaymentWithRelations[]
    },
    enabled: !!orgId && !IS_MOCK,
  })

  useEffect(() => {
    if (paymentsError && paymentsQueryError) {
      toast({ title: t("common.error") || "Error", description: paymentsQueryError.message, variant: "destructive" })
    }
  }, [paymentsError, paymentsQueryError])

  const { data: members } = useQuery({
    queryKey: ["members-list", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return []
      const { data } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("first_name")
      return data as Pick<Member, "id" | "first_name" | "last_name">[]
    },
    enabled: !!orgId && !IS_MOCK,
  })

  const { data: subscriptions } = useQuery({
    queryKey: ["subscriptions-list", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return []
      const { data } = await supabase
        .from("subscription_types")
        .select("id, name, price")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("name")
      return data as Pick<SubscriptionType, "id" | "name" | "price">[]
    },
    enabled: !!orgId && !IS_MOCK,
  })

  const addMutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!orgId) throw new Error("No organization")
      if (IS_MOCK) return
      const { error } = await supabase.from("payments").insert({
        organization_id: orgId,
        member_id: values.member_id,
        subscription_id: values.subscription_id && values.subscription_id !== "none" ? values.subscription_id : null,
        amount: values.amount,
        payment_method: values.payment_method,
        payment_date: values.payment_date,
        status: "completed",
        notes: values.notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] })
      queryClient.invalidateQueries({ queryKey: ["recent-payments"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      queryClient.invalidateQueries({ queryKey: ["member-subscriptions", orgId] })
      queryClient.invalidateQueries({ queryKey: ["payments", orgId] })
      setAddDialogOpen(false)
      form.reset()
      toast({ title: t("payments.paymentAdded") })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  const filteredPayments = useMemo(() => {
    return payments?.filter((p: PaymentWithRelations) => {
      const name = `${p.members?.first_name ?? ""} ${p.members?.last_name ?? ""}`.toLowerCase()
      const matchesSearch = name.includes(search.toLowerCase()) || p.notes?.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === "all" || p.status === statusFilter
      const matchesMethod = methodFilter === "all" || p.payment_method === methodFilter
      return matchesSearch && matchesStatus && matchesMethod
    })
  }, [payments, search, statusFilter, methodFilter])

  const { page, setPage, totalPages, paginatedData: paginatedPayments } = usePagination(filteredPayments, 20)

  const { exportCsv, isExporting } = useExportCsv(
    (filteredPayments ?? []).map((p: PaymentWithRelations) => ({
      member_name: `${p.members?.first_name ?? ""} ${p.members?.last_name ?? ""}`,
      amount: p.amount,
      payment_date: p.payment_date,
      payment_method: p.payment_method,
      status: p.status,
      notes: p.notes || "",
    })),
    'paiements',
    [
      { key: 'member_name', label: 'Membre' },
      { key: 'amount', label: 'Montant' },
      { key: 'payment_date', label: 'Date' },
      { key: 'payment_method', label: 'Méthode' },
      { key: 'status', label: 'Statut' },
      { key: 'notes', label: 'Notes' },
    ]
  )

  const handleGenerateInvoice = useCallback(async (payment: PaymentWithRelations) => {
    if (!orgId) return
    const num = await getNextInvoiceNumber(orgId)
    setInvoiceNumber(num)
    setSelectedPayment(payment)
    setInvoiceDialogOpen(true)
  }, [orgId])

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
          member_name: String(r.member_name || r.Member || ""),
          amount: Number.isNaN(rawAmount) ? 0 : rawAmount,
          payment_method: String(r.payment_method || r.Method || "cash"),
          payment_date: String(r.payment_date || r.Date || format(new Date(), "yyyy-MM-dd")),
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
    for (const row of importData) {
      if (IS_MOCK) { imported++; continue }
      const memberResult = await supabase
        .from("members")
        .select("id")
        .eq("organization_id", orgId)
        .or(`first_name.ilike.%${row.member_name}%,last_name.ilike.%${row.member_name}%`)
        .maybeSingle()
      if (!memberResult.data) { errors++; continue }
      const { error: insertError } = await supabase.from("payments").insert({
        organization_id: orgId,
        member_id: memberResult.data.id,
        amount: row.amount,
        payment_method: (["cash", "card", "transfer", "other"].includes(row.payment_method) ? row.payment_method : "cash") as Payment["payment_method"],
        payment_date: row.payment_date,
        status: "completed",
        notes: row.notes || null,
      })
      if (insertError) { errors++ } else { imported++ }
    }
    queryClient.invalidateQueries({ queryKey: ["payments"] })
    queryClient.invalidateQueries({ queryKey: ["recent-payments"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
    setImportData([])
    setImportDialogOpen(false)
    toast({ title: errors > 0 ? `${imported} importé(s), ${errors} erreur(s)` : t("payments.importSuccess") })
  }, [importData, orgId, supabase, queryClient, toast, t])

  const handleExportExcel = useCallback(async () => {
    if (!payments) return
    const ExcelJS = await import("exceljs")
    const wb = new ExcelJS.default.Workbook()
    const ws = wb.addWorksheet("Paiements")
    ws.columns = [
      { header: "Membre", key: "Membre", width: 30 },
      { header: "Montant", key: "Montant", width: 15 },
      { header: "Date", key: "Date", width: 15 },
      { header: "Méthode", key: "Méthode", width: 15 },
      { header: "Statut", key: "Statut", width: 15 },
      { header: "Notes", key: "Notes", width: 30 },
    ]
    payments.forEach((p: PaymentWithRelations) => {
      ws.addRow({
        Membre: `${p.members?.first_name ?? ""} ${p.members?.last_name ?? ""}`,
        Montant: p.amount,
        Date: formatDate(p.payment_date),
        Méthode: getMethodLabel(p.payment_method),
        Statut: p.status,
        Notes: p.notes || "",
      })
    })
    await wb.xlsx.writeFile("paiements.xlsx")
  }, [payments, getMethodLabel])

  const filteredMembers = members?.filter((m: Pick<Member, "id" | "first_name" | "last_name">) =>
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(memberSearch.toLowerCase())
  )

  return (
    <div>
      <PageHeader
        title={t("payments.title")}
        description={t("payments.description")}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("payments.import")}
            </Button>
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="mr-2 h-4 w-4" />
              {t("common.export")}
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("payments.add")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader className="shrink-0">
                  <DialogTitle>{t("payments.add")}</DialogTitle>
                  <DialogDescription>Ajouter un nouveau paiement</DialogDescription>
                </DialogHeader>
                <div className="overflow-y-auto flex-1 -mx-6 px-6">
                  <Form {...form}>
                    <form id="payment-form" onSubmit={form.handleSubmit((v) => addMutation.mutate(v))} className="space-y-4 py-1">
                      <FormField
                        control={form.control}
                        name="member_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Membre</FormLabel>
                            <FormControl>
                              <div>
                                <Input
                                  placeholder="Rechercher un membre..."
                                  value={memberSearch}
                                  onChange={(e) => setMemberSearch(e.target.value)}
                                  className="mb-2"
                                />
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Sélectionner un membre" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <ScrollArea className="h-48">
                                      {filteredMembers?.map((m: Pick<Member, "id" | "first_name" | "last_name">) => (
                                        <SelectItem key={m.id} value={m.id}>
                                          {toUpper(m.first_name)} {toUpper(m.last_name)}
                                        </SelectItem>
                                      ))}
                                      {filteredMembers?.length === 0 && (
                                        <div className="p-2 text-sm text-muted-foreground">Aucun membre trouvé</div>
                                      )}
                                    </ScrollArea>
                                  </SelectContent>
                                </Select>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="subscription_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Abonnement</FormLabel>
                            <Select value={field.value || "none"} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Aucun" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Aucun</SelectItem>
                                {subscriptions?.map((s: Pick<SubscriptionType, "id" | "name" | "price">) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {toUpper(s.name)} - {s.price.toLocaleString()} DZD
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
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("payments.amount")}</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="payment_method"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("payments.method")}</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cash">{t("payments.cash")}</SelectItem>
                                <SelectItem value="card">{t("payments.card")}</SelectItem>
                                <SelectItem value="transfer">{t("payments.transfer")}</SelectItem>
                                <SelectItem value="other">Autre</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="payment_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("payments.date")}</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("payments.notes")}</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
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
                  <Button type="submit" form="payment-form" disabled={addMutation.isPending}>
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
          <div className="flex flex-wrap gap-4">
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("common.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="completed">{t("payments.completed")}</SelectItem>
                <SelectItem value="pending">{t("common.pending")}</SelectItem>
                <SelectItem value="cancelled">{t("payments.cancelled")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("payments.method")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="cash">{t("payments.cash")}</SelectItem>
                <SelectItem value="card">{t("payments.card")}</SelectItem>
                <SelectItem value="transfer">{t("payments.transfer")}</SelectItem>
                <SelectItem value="other">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membre</TableHead>
                  <TableHead>{t("payments.amount")}</TableHead>
                  <TableHead>{t("payments.date")}</TableHead>
                  <TableHead>{t("payments.method")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("payments.notes")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : paginatedPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t("payments.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={() => openMember(payment.member_id)}
                          title="Ouvrir la fiche adhérent"
                          className="text-left font-medium cursor-pointer hover:text-primary hover:underline transition-colors"
                        >
                          {toUpper(payment.members?.first_name)} {toUpper(payment.members?.last_name)}
                        </button>
                        {payment.members?.member_number && <span className="ml-2 text-xs text-muted-foreground">({payment.members.member_number})</span>}
                      </TableCell>
                      <TableCell>{formatCurrency(payment.amount)}</TableCell>
                      <TableCell>{formatDate(payment.payment_date)}</TableCell>
                      <TableCell>
                        <Badge variant={payment.payment_method === "cash" ? "secondary" : payment.payment_method === "card" ? "default" : "outline"}>
                          {getMethodLabel(payment.payment_method)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadge[payment.status] || "outline"}>
                          {payment.status === "completed" ? t("payments.completed") : payment.status === "pending" ? t("common.pending") : t("payments.cancelled")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] max-h-20 overflow-y-auto text-xs leading-snug">
                        {cleanPaymentNotes(payment.notes) ? toUpper(cleanPaymentNotes(payment.notes)) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleGenerateInvoice(payment)}>
                          <FileText className="h-4 w-4" />
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
            ) : paginatedPayments.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("payments.noData")}</p>
            ) : (
              paginatedPayments.map((payment) => (
                <Card key={payment.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <button
                        type="button"
                        onClick={() => openMember(payment.member_id)}
                        title="Ouvrir la fiche adhérent"
                        className="font-medium text-left cursor-pointer hover:text-primary hover:underline transition-colors"
                      >
                        {toUpper(payment.members?.first_name)} {toUpper(payment.members?.last_name)}
                      </button>
                      <p className="text-sm text-muted-foreground">{formatDate(payment.payment_date)}</p>
                    </div>
                    <Badge variant={statusBadge[payment.status] || "outline"}>
                      {payment.status === "completed" ? t("payments.completed") : payment.status === "pending" ? t("common.pending") : t("payments.cancelled")}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                      <Badge variant={payment.payment_method === "cash" ? "secondary" : payment.payment_method === "card" ? "default" : "outline"}>
                        {getMethodLabel(payment.payment_method)}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleGenerateInvoice(payment)}>
                      <FileText className="h-4 w-4" />
                    </Button>
                  </div>
                  {cleanPaymentNotes(payment.notes) && (
                    <p className="mt-2 text-xs text-muted-foreground max-h-16 overflow-y-auto leading-snug">
                      {toUpper(cleanPaymentNotes(payment.notes))}
                    </p>
                  )}
                </Card>
              ))
            )}
          </div>

          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={totalPages} totalItems={filteredPayments?.length ?? 0} pageSize={20} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>

      {selectedPayment && orgId && (
        <InvoiceDialog
          open={invoiceDialogOpen}
          onOpenChange={setInvoiceDialogOpen}
          payment={selectedPayment}
          invoiceNumber={invoiceNumber}
          organizationName={organization?.name ?? ""}
          organizationAddress={organization?.address}
          organizationPhone={organization?.phone}
        />
      )}

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t("payments.import")}</DialogTitle>
            <DialogDescription>Importer des paiements depuis un fichier Excel</DialogDescription>
          </DialogHeader>
          {importData.length === 0 ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  {t("payments.importInstructions")}
                </p>
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
                      <TableHead>Membre</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{toUpper(row.member_name)}</TableCell>
                        <TableCell>{row.amount}</TableCell>
                        <TableCell>{toUpper(row.payment_method)}</TableCell>
                        <TableCell>{toUpper(row.payment_date)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportData([])}>
                  Annuler
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
