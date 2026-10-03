import * as React from "react"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Case à cocher basée sur un `<input type="checkbox">` natif.
 *
 * Pourquoi pas `@radix-ui/react-checkbox` : la dépendance n'est pas dans le
 * projet et n'apporterait rien ici — un input natif est déjà accessible, gère le
 * clavier et le focus. Surtout, il permet l'état `indeterminate` (case
 * « cochée partiellement »), que le composant Radix n'expose pas : c'est
 * indispensable pour l'en-tête « tout sélectionner » d'une liste paginée.
 *
 * `indeterminate` n'est pas un attribut HTML : on le pose via la propriété DOM
 * dans un effet, sinon React l'écraserait à chaque rendu.
 *
 * L'icône est un **frère** de l'input, pas un enfant : `<input>` est un élément
 * vide et ne peut pas contenir de JSX.
 */
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked?: boolean
  /** Case « cochée partiellement » : une partie des lignes de la page seulement. */
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
}

function setRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === "function") ref(value)
      else (ref as React.MutableRefObject<T | null>).current = value
    }
  }
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    { className, checked = false, indeterminate = false, onCheckedChange, disabled, ...props },
    ref
  ) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    const mergedRef = setRefs<HTMLInputElement>(innerRef, ref)

    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate && !checked
    }, [indeterminate, checked])

    const showDash = indeterminate && !checked
    const showCheck = checked

    return (
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <input
          ref={mergedRef}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className={cn(
            "peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border bg-background transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            "disabled:cursor-not-allowed disabled:opacity-50",
            showDash || showCheck ? "border-primary bg-primary" : "border-primary/40",
            className
          )}
          {...props}
        />
        {showDash ? (
          <Minus
            className="pointer-events-none absolute h-3 w-3 text-primary-foreground"
            aria-hidden
          />
        ) : showCheck ? (
          <Check
            className="pointer-events-none absolute h-3 w-3 text-primary-foreground"
            aria-hidden
          />
        ) : null}
      </span>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }