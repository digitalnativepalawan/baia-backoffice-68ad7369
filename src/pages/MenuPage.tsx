import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/lib/cart';
import { ShoppingBag, Plus, Minus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CartDrawer from '@/components/CartDrawer';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number;
  available: boolean;
  sort_order: number;
}

const CATEGORIES = [
  'Breakfast', 'Breakfast Drinks', 'Starters', 'Pasta', 'Main Courses', 'Dessert',
  'Cocktails', 'Wine', 'Soft Drinks & Beer',
  'Coffee (Hot)', 'Coffee (Iced)', 'Fruit Smoothies',
];

const MenuPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get('mode') || 'guest';
  const orderType = searchParams.get('orderType') || 'WalkIn';
  const location = searchParams.get('location') || '';

  const [activeCategory, setActiveCategory] = useState('Starters');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);

  const cart = useCart();

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu_items'],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .eq('available', true)
        .order('sort_order');
      return (data || []) as MenuItem[];
    },
  });

  const filteredItems = menuItems.filter(i => i.category === activeCategory);

  const handleAddToCart = () => {
    if (!selectedItem) return;
    for (let i = 0; i < addQuantity; i++) {
      cart.addItem({ id: selectedItem.id, name: selectedItem.name, price: selectedItem.price });
    }
    setSelectedItem(null);
    setAddQuantity(1);
  };

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-navy-deep/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-2 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="font-body text-sm text-cream-dim hover:text-foreground transition-colors">
            ← Back
          </button>
          <h1 className="font-display text-lg tracking-[0.15em] text-foreground">BAIA PALAWAN</h1>
          <div className="w-12" />
        </div>

        {/* Category tabs */}
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-6 overflow-x-auto">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`font-display text-sm tracking-wider whitespace-nowrap pb-1 transition-colors border-b-2 ${
                activeCategory === cat
                  ? 'border-gold text-foreground'
                  : 'border-transparent text-cream-dim hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Menu content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
        <h2 className="font-display text-2xl tracking-wider text-foreground mb-8">{activeCategory}</h2>

        <div className="flex flex-col gap-6">
          {filteredItems.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => { setSelectedItem(item); setAddQuantity(1); }}
              className="text-left animate-fade-in group"
              style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'both' }}
            >
              {/* Name + dotted leader + price */}
              <div className="flex items-baseline">
                <span className="font-display text-base md:text-lg text-foreground group-hover:text-gold transition-colors">
                  {item.name}
                </span>
                <span className="dotted-leader" />
                <span className="font-display text-base text-foreground whitespace-nowrap">
                  ₱{item.price.toLocaleString()}
                </span>
              </div>
              {/* Description */}
              {item.description && (
                <p className="font-body text-sm text-cream-dim mt-1 leading-relaxed">
                  {item.description}
                </p>
              )}
            </button>
          ))}
        </div>
      </main>

      {/* Floating cart button */}
      {cart.count() > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gold text-primary-foreground flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center font-body font-bold">
            {cart.count()}
          </span>
        </button>
      )}

      {/* Item detail modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="bg-card border-border max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider text-center">
              {selectedItem?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="flex flex-col items-center gap-4 pt-2">
              <p className="font-body text-sm text-cream-dim text-center">{selectedItem.description}</p>
              <p className="font-display text-xl text-foreground">₱{selectedItem.price.toLocaleString()}</p>
              
              {/* Quantity selector */}
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setAddQuantity(Math.max(1, addQuantity - 1))}
                  className="w-10 h-10 border border-border rounded-full flex items-center justify-center text-foreground hover:border-gold transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-display text-xl text-foreground w-8 text-center">{addQuantity}</span>
                <button
                  onClick={() => setAddQuantity(addQuantity + 1)}
                  className="w-10 h-10 border border-border rounded-full flex items-center justify-center text-foreground hover:border-gold transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <Button onClick={handleAddToCart} className="w-full font-display tracking-wider py-6">
                Add to Order — ₱{(selectedItem.price * addQuantity).toLocaleString()}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cart drawer */}
      <CartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        mode={mode}
        orderType={orderType}
        locationDetail={location}
      />
    </div>
  );
};

export default MenuPage;
