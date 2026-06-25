
# StayKaro LMS — Antigravity AI Guidelines

## Stack & Architecture
- React + TypeScript + Vite
- Tailwind CSS with shadcn/ui components (from `../components/ui/`)
- React Router v7 (file: `src/app/router/routes.tsx`)
- Recharts for all charts
- Lucide React for all icons
- Motion (motion/react) for animations — use `motion.div` with `initial/animate/transition`
- State: local useState only — no Redux, no Zustand

## Design System Tokens (use ONLY these CSS variables)
- `var(--gold)` — primary accent color
- `var(--gold-muted)` — soft gold background tint
- `var(--card)` — card background
- `var(--border)` — border color
- `var(--foreground)` — primary text
- `var(--muted-foreground)` — secondary text
- `var(--background)` — page background
- `var(--primary)` — interactive primary (buttons)
- `var(--accent)` — hover state background

## File Structure Rules
- All pages go in: `src/features/[role]/PageName.tsx` and export a named function
- All routes are registered in: `src/router/routes.tsx`
- All sidebar links are in: `src/shared/components/Sidebar.tsx` (add to the correct role's menu array)
- Keep static data co-located with the component — there is no global mockData file
- If a page needs props, define an interface like `interface PageProps { userType: UserType }`

## Component Patterns to Follow

### Page skeleton:
```tsx
export function NewPage() {
  return (
    <div className="p-8 space-y-6">
      <PageHeader title="..." description="..." actions={<Button>...</Button>} />
      {/* content */}
    </div>
  );
}
```

### Card pattern:
```tsx
<div className="bg-card border border-border rounded-xl p-6">
```

### Tab pattern:
```tsx
<div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit">
  {tabs.map(t => (
    <button key={t} onClick={() => setTab(t)}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
        ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
      {t}
    </button>
  ))}
</div>
```

### Status badge pattern:
```tsx
<span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[var(--gold-muted)] text-[var(--gold)]">
  Label
</span>
```

## Rules
1. NEVER use hardcoded hex colors — always use CSS variables above
2. NEVER create new UI component primitives — use existing ones from `ui/`
3. ALWAYS use `StatCard` from `../components/StatCard` for metric cards
4. ALWAYS use `PageHeader` from `./PageHeader` at the top of every page
5. Keep mock data in `mockData.ts`, not inside components
6. When adding a new page: (a) create the TSX file, (b) add import + route in routes.tsx, (c) add sidebar link in Sidebar.tsx
7. Modals use the pattern: `fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm`
8. Use `toast()` from sonner for all success/error feedback
9. No page should have a blank state without an empty-state illustration + message
