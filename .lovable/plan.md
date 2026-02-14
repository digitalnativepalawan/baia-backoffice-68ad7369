

## Fix Mobile Experience for All Pages

### Current State
After thorough testing on a 390x844 mobile viewport, all core features ARE functioning (menu categories load, items display, cart works, order type selection works, admin page works). However, there are several mobile UX issues that need fixing:

### Issues Found

**1. Visible scrollbar on menu category tabs**
The horizontal category tab bar on the MenuPage shows an ugly native scrollbar. On mobile, this should be hidden with smooth touch-scroll instead.

**2. Category tabs lack scroll hint**
With 7 categories (Food Menu, Non-Alcoholic, Fruit Shakes, Cocktails, Wine, Spirits, Beer), users can't see that more tabs exist off-screen. No visual indicator that scrolling is possible.

**3. Cart drawer item row is cramped on mobile**
The cart item row tries to fit Item name, -/qty/+, unit price, total, and delete icon all in one line. On small screens this gets very tight and truncated.

**4. Dialog/modal sizing on small screens**
The item detail dialog uses `max-w-xs` which is fine, but could benefit from better mobile padding.

### Plan

**Step 1: Hide scrollbar on category tabs (MenuPage.tsx)**
- Add CSS class to hide the scrollbar while keeping horizontal scroll functionality
- Add `scrollbar-hide` utility class in index.css using `-webkit-scrollbar` and `scrollbar-width: none`
- Add a subtle fade/gradient on the right edge to hint that more categories exist

**Step 2: Improve cart drawer layout for mobile (CartDrawer.tsx)**
- Stack the item info more vertically on small screens
- Give the item name more room, move price/total to a second line on narrow screens
- Increase touch target sizes for the +/- and delete buttons (currently 3-3.5px icons which are too small for fingers)

**Step 3: Ensure touch-friendly tap targets across all pages**
- Increase minimum touch target sizes to 44x44px for interactive elements
- Menu items on MenuPage already have good tap targets
- Cart quantity +/- buttons need larger hit areas
- Admin page tabs need adequate spacing

**Step 4: Fix any z-index or overlay issues**
- Ensure Select dropdowns on OrderType page have proper z-index and background on mobile
- Confirm Dialog overlays work correctly (already tested and working)

### Technical Details

Files to modify:
- `src/index.css` - Add scrollbar-hide utility class
- `src/pages/MenuPage.tsx` - Apply scrollbar-hide to category tabs, add scroll fade indicator
- `src/components/CartDrawer.tsx` - Improve mobile layout for cart items, increase touch targets
- `src/pages/OrderType.tsx` - Minor touch target improvements
- `src/pages/AdminPage.tsx` - Ensure admin tabs scroll properly on mobile

