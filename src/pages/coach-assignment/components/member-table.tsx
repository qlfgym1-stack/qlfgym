import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { MemberCategoryBadge } from '@/components/shared/member-category-badge'
import { useT } from '@/i18n'
import { Users } from 'lucide-react'
import { toUpper, formatPhone } from '@/lib/utils'
import {
  ASSIGNMENT_PAGE_SIZE,
  type AssignmentMember,
  type CoachFilter,
} from '../hooks/useCoachAssignmentData'

interface MemberTableProps {
  members: AssignmentMember[]
  total: number
  totalPages: number
  page: number
  onPageChange: (page: number) => void
  selectedIds: Set<string>
  onToggle: (id: string) => void
  /** Reçoit les ids de la page courante ; le parent décide de les retirer ou non. */
  onTogglePage: (ids: string[]) => void
  search: string
  onSearchChange: (value: string) => void
  coachFilter: CoachFilter
  /** Affiche la colonne coach quand aucune destination n'est ciblée. */
  showCoachColumn: boolean
  readOnly: boolean
}

export function MemberTable({
  members,
  total,
  totalPages,
  page,
  onPageChange,
  selectedIds,
  onToggle,
  onTogglePage,
  search,
  onSearchChange,
  coachFilter,
  showCoachColumn,
  readOnly,
}: MemberTableProps) {
  const t = useT()

  const pageIds = useMemo(() => members.map((m) => m.id), [members])
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length
  const allSelected = pageIds.length > 0 && selectedOnPage === pageIds.length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('coachAssignment.filters.searchPlaceholder')}
          className="h-9 max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <Badge className="tabular-nums">
              {t('coachAssignment.members.selected').replace('{count}', String(selectedIds.size))}
            </Badge>
          ) : null}
          <span className="text-sm tabular-nums text-muted-foreground">{total}</span>
        </div>
      </div>

      <div className="rounded-md border">
        {members.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('coachAssignment.members.empty')}
            description={t('coachAssignment.members.emptyHint')}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  {/* `indeterminate` affiche l'état « une partie seulement » quand
                      la sélection couvre certaines lignes de la page et pas toutes. */}
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedOnPage > 0 && !allSelected}
                    aria-label={t('coachAssignment.members.selectAll')}
                    disabled={readOnly || members.length === 0}
                    onCheckedChange={() => onTogglePage(pageIds)}
                  />
                </TableHead>
                <TableHead>{t('coachAssignment.members.name')}</TableHead>
                <TableHead>{t('coachAssignment.members.category')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('members.phone')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('coachAssignment.members.status')}</TableHead>
                {showCoachColumn ? (
                  <TableHead className="hidden lg:table-cell">{t('members.fullExport.coach')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow
                  key={member.id}
                  className={selectedIds.has(member.id) ? 'bg-primary/5' : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(member.id)}
                      aria-label={
                        member.full_name ?? `${member.first_name} ${member.last_name}`
                      }
                      disabled={readOnly}
                      onCheckedChange={() => onToggle(member.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {member.full_name ?? `${toUpper(member.first_name)} ${toUpper(member.last_name)}`}
                  </TableCell>
                  <TableCell>
                    <MemberCategoryBadge category={member.category} age={member.age} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {member.phone ? formatPhone(member.phone) : '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={member.status === 'active' ? 'default' : 'outline'}>
                      {t(`coachAssignment.status.${member.status}`)}
                    </Badge>
                  </TableCell>
                  {showCoachColumn ? (
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {member.coach_id
                        ? `${toUpper(member.coach_first_name ?? '')} ${toUpper(member.coach_last_name ?? '')}`.trim()
                        : t('members.noCoachAssigned')}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        pageSize={ASSIGNMENT_PAGE_SIZE}
        onPageChange={onPageChange}
      />

      <p className="text-xs text-muted-foreground">
        {t('coachAssignment.members.selectionHint').replace('{selected}', String(selectedIds.size)).replace('{total}', String(total))}
      </p>
    </div>
  )
}