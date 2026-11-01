import * as React from "react"
import { cn } from "cn"

function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn(
        "rounded-lg border bg-card p-5 text-card-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Card }
