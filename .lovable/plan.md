

## Make New Orders More Obvious with Full Card Glow + Sound Notification

### Problem
The current blinking indicator is just a tiny red dot on the "Start Preparing" button -- too subtle for a busy kitchen. The chef needs a much more obvious visual alert and a repeating sound notification until the order is acknowledged.

### Changes

**1. Make the entire "New" order card visually urgent**
- Add a pulsing gold/amber border glow animation to the entire card when status is "New"
- Make the "Start Preparing" button itself pulse/flash with a bright background
- Add a bold "NEW ORDER" banner or animated label at the top of the card
- The card border will glow in and out to catch the chef's eye from across the kitchen

**2. Add a repeating notification sound for new orders**
- In `StaffOrdersView`, track which order IDs have been "seen" (status advanced from New)
- When a new order appears with status "New", play a short notification chime on a loop (every 5 seconds)
- The sound stops as soon as the chef taps "Start Preparing" on that order
- Use the Web Audio API with a generated tone (no external file needed) to avoid mobile audio restrictions
- On first interaction with the page, unlock audio context for mobile browsers

**3. Add a "New" tab pulse indicator**
- When there are New orders, make the "New" status tab itself pulse to draw attention even if the chef is on another tab

### Technical Details

**Files to modify:**

- `src/components/admin/OrderCard.tsx`
  - When `order.status === 'New'`, apply a glowing/pulsing border animation class to the entire card
  - Make the "Start Preparing" button larger and more prominent with an animated background
  - Keep the existing small dot but add the card-level animation as well

- `src/index.css`
  - Add `@keyframes glow-pulse` for the card border glow effect
  - Add `@keyframes btn-pulse` for the button flash effect

- `src/components/staff/StaffOrdersView.tsx`
  - Add a `useRef` for AudioContext and a `useEffect` that monitors new orders
  - Track acknowledged order IDs in state
  - Play a repeating notification tone every 5 seconds while there are unacknowledged "New" orders
  - Stop the sound when all New orders have been advanced
  - Unlock audio on first user tap (for mobile browser restrictions)

**Sound approach:** Generate a simple two-tone chime using Web Audio API `OscillatorNode` -- no external audio files needed, works offline, and avoids CORS/file issues.

