# CoachFlow — Mobile App (Expo)

Owner, Teacher aur Parent — teeno ke liye ek hi app. Login ke role ke hisaab se app apne aap sahi screens dikhata hai.
Ye app wahi server (`../server`) use karta hai jo website use karti hai — alag se kuch setup nahi.

## Kya kya hai

**Owner** — Dashboard (aaj ki fees, classes, staff check-in, pending salary, follow-ups) · Students (search, call/WhatsApp, fees collect, receipts, results) · Fees (pending/overdue, collect, reminder bhejna) · Leads (add, status, follow-up, notes) · Attendance · Tests & marks · Leave approve · Announcements · Timetable & syllabus · Staff check-in/out · Salaries (pay, chhutti ki katautī auto) · Teacher work reports (seen / reply) · Notifications

**Teacher** — Daily work report (owner ko) · Check-in / Check-out (location ke saath, agar owner ne on kiya ho) · Aaj ki classes → attendance · Tests me marks entry & publish · Syllabus topics tick · Leave requests · Announcements · Meri attendance & salary

**Parent** — Home (attendance %, latest result, fees, next class, notice board, holidays, announcements, syllabus progress) · Results + rank + class average + report card · Fees online pay (Razorpay) + receipts · Online test dena + result review · Study material (PDF/notes/links) · Leave apply/cancel · Ek se zyada bachche ho to upar se switch

Har list 20-20 karke aati hai — neeche **Previous / Next** buttons. Owner ki Enquiries / Dashboard har 30 sec me khud update hoti hai.

## Chalane ka tareeka (PC + phone, same Wi-Fi)

1. **Server chalu rakho** (pehle ki tarah):
   ```bash
   cd server
   npm run dev          # http://localhost:4600
   ```
2. **App install karo** (pehli baar):
   ```bash
   cd mobile
   npm install
   npx expo install --fix     # sab Expo packages ka sahi version set kar deta hai
   ```
3. **App start karo:**
   ```bash
   npx expo start
   ```
   Phone me **Expo Go** app (Play Store / App Store) kholo aur terminal ka QR code scan karo.
4. **Server address set karo:** login screen pe "Server address" pe tap karo → apne PC ka Wi-Fi IP daalo, jaise `http://192.168.1.10:4600`
   (Windows me `ipconfig` → "IPv4 Address"). "Save & test connection" dabao — ✓ aaye to login karo.
   - Default address `app.json` → `expo.extra.apiUrl` me badal sakte ho.
   - Windows Firewall port 4600 block kare to "Allow" kar do.
   - Production server (https) ho to wahi address daalo.

Type check: `npm run typecheck`

## APK / Play Store build

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview     # installable APK
eas build -p android --profile production  # Play Store (.aab)
```
Build se pehle `app.json` me `extra.apiUrl` ko apne live server (https://…) pe set kar do.

## Online payment (Parent)

Owner website me **Settings → Payments** me apni Razorpay keys daale. App me parent "Pay" dabata hai → secure payment page browser me khulta hai → payment ke baad app me wapas aa jata hai aur receipt ban jati hai.
Server ka address phone se khulna chahiye (same Wi-Fi ya live https server).

## Abhi sirf website par

Ye kaam abhi website (owner panel) se hi hote hain: student add/edit & admission, batch/course banana, fee plan banana, study material upload, online test ke questions banana, website/settings, subscription, chat, reports.
Push notifications (phone me bina app khole alert) abhi nahi hain — app ke andar Notifications screen hai, aur WhatsApp/SMS reminders server se pehle ki tarah jaate hain.
