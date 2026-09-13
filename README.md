# PortfolioTrack

以 Next.js 16、MongoDB 與 Better Auth 建置的個人股票庫存管理工具。

## 環境變數

將 `.env.example` 複製為 `.env.local`，並設定：

- `MONGODB_URI`：連到 `PortfolioTrack` database 的 MongoDB 連線字串。
- `BETTER_AUTH_SECRET`：至少 32 字元的高熵隨機密鑰；本機與正式環境必須分別設定。
- `BETTER_AUTH_URL`：本機使用 `http://localhost:3000`，正式環境使用網站的 HTTPS 網址。

連線字串與密鑰不得提交到 Git。

## 建立首帳與歸戶既有資料

先執行唯讀預覽：

```powershell
npm run auth:bootstrap -- --dry-run
```

預覽必須確認 database、validator、索引與既有筆數符合預期。實際建立首帳時，密碼只放在目前 PowerShell process environment：

```powershell
$env:BOOTSTRAP_PASSWORD = "你的密碼"
npm run auth:bootstrap -- --name="顯示名稱" --email="name@example.com"
Remove-Item Env:BOOTSTRAP_PASSWORD
```

工具會建立 Better Auth collections、建立或重用指定 Email 的帳號、將既有個人投資資料加上該帳號的 `userId`，再依原始 `_id` 查回驗證。若筆數、擁有者或 schema 與預覽不符，工具會停止而不擴大寫入範圍。

## 本機開發

```powershell
npm install
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。首頁市場統計公開；庫存、買賣與股息頁面需要登入。

## 品質檢查

```powershell
npm run lint
npx tsc --noEmit
npm run build
```
