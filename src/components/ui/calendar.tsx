import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Calendário (shadcn/ui) para o react-day-picker v9.
 *
 * A v9 trocou os nomes das classes (`nav_button_previous` → `button_previous`,
 * `day_range_end` → `range_end`…) e usa um único componente `Chevron` para a
 * navegação. A v9 também não exige mais `date-fns` como peer — por isso o
 * `date-fns` pode subir para a v4 sem quebrar o install.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2 relative",
        month: "flex flex-col gap-4",
        month_caption: "flex h-10 items-center justify-center px-2",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1 absolute top-0 right-0 z-10",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "size-7 p-0 opacity-50 hover:opacity-100 absolute left-1 top-1",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "size-7 p-0 opacity-50 hover:opacity-100 absolute right-1 top-1",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-xs font-normal text-muted-foreground",
        week: "flex w-full mt-2",
        day: cn(buttonVariants({ variant: "ghost" }), "size-9 p-0 font-normal aria-selected:opacity-100"),
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...props }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
