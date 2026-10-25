export default function DashboardPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Películas Añadidas Recientemente</h2>
        <p className="text-muted-foreground">Tu bóveda personal de cine.</p>
      </div>

      {/* Placeholder del Grid de Películas */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="aspect-[2/3] bg-card border border-border rounded-xl flex items-center justify-center hover:scale-105 transition-transform cursor-pointer">
            <span className="text-muted-foreground text-sm font-mono">PÓSTER {i}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
