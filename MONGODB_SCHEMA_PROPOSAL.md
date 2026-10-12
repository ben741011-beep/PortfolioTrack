# MongoDB Schema Proposal — 美國經濟數據時程

狀態：已核准並於 2026-10-02 建立 collection、validator 與 index；首次受控寫入與完整同步皆已完成。

## 1. 目的與資料流程

- Collection：`usEconomicEvents`
- 用途：儲存 Federal Reserve、BLS 與 BEA 公布的 FOMC、CPI、PPI、PCE 官方時程。
- 普通頁面：只讀 MongoDB，不呼叫外部網站。
- 手動更新：登入使用者按下按鈕後，伺服器一次抓取四個官方頁面；所有來源皆成功且通過解析檢查後，才依 `eventKey` upsert。
- 所有資料為全站共用的公開市場資料，不使用 `userId` 或 `familyMemberId`。
- 不儲存官方 HTML；只保留解析後的時程、來源 URL、來源頁 SHA-256 與抓取時間。
- 不自動刪除官方頁面暫時缺少的舊文件；同一事件改期時會更新既有文件。

## 2. 文件欄位

| 欄位 | TypeScript | BSON | 必填 | 來源與語意 |
| --- | --- | --- | --- | --- |
| `_id` | `ObjectId` | `objectId` | MongoDB 產生 | 文件識別碼 |
| `eventKey` | `string` | `string` | 是 | 穩定商業鍵，例如 `CPI:2026-09`、`FOMC:2026-10` |
| `eventType` | `"FOMC" \| "CPI" \| "PPI" \| "PCE"` | `string enum` | 是 | 事件種類 |
| `referencePeriod` | `string` | `string` | 是 | 正規化參考期，格式 `YYYY-MM` |
| `sourcePeriodLabel` | `string` | `string` | 是 | 官方頁面的月份或會議日期標籤 |
| `sourceReleaseName` | `string` | `string` | 是 | 官方發布名稱，不放 UI 翻譯 |
| `releaseAt` | `Date` | `date` | 是 | 發布瞬間，MongoDB 以 UTC Date 儲存 |
| `sourceLocalDate` | `string` | `string` | 是 | 官方美東日期，格式 `YYYY-MM-DD` |
| `sourceLocalTime` | `string` | `string` | 是 | 官方美東時間，格式 `HH:mm` |
| `sourceTimeZone` | `"America/New_York"` | `string enum` | 是 | 官方時區 |
| `sourceAgency` | `"Federal Reserve" \| "BLS" \| "BEA"` | `string enum` | 是 | 官方機構 |
| `sourceUrl` | `string` | `string` | 是 | 官方來源 HTTPS URL |
| `hasProjections` | `boolean` | `bool` | 是 | FOMC 是否同時發布經濟預測；其他事件為 `false` |
| `sourcePageHash` | `string` | `string` | 是 | 抓取頁面的 SHA-256（64 位十六進位） |
| `fetchedAt` | `Date` | `date` | 是 | 本次成功抓取時間 |
| `createdAt` | `Date` | `date` | 是 | 首次寫入時間 |
| `updatedAt` | `Date` | `date` | 是 | 最近 upsert 時間 |

### 值語意

- 上述欄位全部必填，不接受 `null`、缺少或空字串。
- `sourceLocalTime` 的 `00:00` 是有效時間，不等於缺值。
- `hasProjections: false` 是明確的否定值，不等於未知。
- 日期只有在解析出官方美東日期、時間與時區後才可轉為 `releaseAt`；不可用伺服器本地時區猜測。
- `referencePeriod` 是商業身分的一部分；同一參考期改期只更新原文件，不新增重複文件。

## 3. Validator

- `validationLevel: "strict"`
- `validationAction: "error"`
- `$jsonSchema.bsonType: "object"`
- `additionalProperties: false`
- 字串包含長度、日期格式、時間格式、HTTPS URL 與 SHA-256 格式限制。
- `releaseAt`、`fetchedAt`、`createdAt`、`updatedAt` 僅接受 BSON `date`。

## 4. 索引與查詢

1. `{ eventKey: 1 }`，名稱 `eventKey_1`，`unique: true`
   - 支援冪等 upsert，避免同一指標參考期重複。
2. `{ releaseAt: 1 }`，名稱 `releaseAt_1`
   - 支援頁面查詢現在之後的事件並依時間排序。
3. `{ eventType: 1, releaseAt: 1 }`，名稱 `eventType_1_releaseAt_1`
   - 支援日後依 FOMC/CPI/PPI/PCE 篩選時程。

不使用 TTL，歷史時程不自動過期。

## 5. Upsert 與冪等性

- Upsert filter：`{ eventKey }`。
- 第一次抓到事件：新增文件並設定 `createdAt`。
- 再次抓到相同 `eventKey`：更新官方時程欄位、hash、`fetchedAt`、`updatedAt`；保留 `_id` 與 `createdAt`。
- 相同來源內容再次執行不會新增文件；更新操作是否為零，以 MongoDB 實際 `modifiedCount` 與 `_id` 查回為準。
- 四個來源任一 HTTP、解析、數量或欄位檢查失敗時，整批停止且不寫入。
- 不因來源暫時少一筆而刪除或停用既有文件，避免部分來源異常造成資料消失。

## 6. 首次寫入與擴大範圍

- Schema 核准後先只建立空 collection、validator 與三個索引，讀回確認文件數仍為 0。
- 第一筆受控寫入建議只寫入下一個官方事件，用 `_id` 查回並以同一 `eventKey` 重跑證明不重複。
- 第一筆驗證成功後，另行核准當年度完整官方時程的批次 upsert。

## 7. 範例文件

```javascript
{
  _id: ObjectId("..."),
  eventKey: "CPI:2026-09",
  eventType: "CPI",
  referencePeriod: "2026-09",
  sourcePeriodLabel: "September 2026",
  sourceReleaseName: "Consumer Price Index",
  releaseAt: ISODate("2026-10-14T12:30:00.000Z"),
  sourceLocalDate: "2026-10-14",
  sourceLocalTime: "08:30",
  sourceTimeZone: "America/New_York",
  sourceAgency: "BLS",
  sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm",
  hasProjections: false,
  sourcePageHash: "<64-character sha256>",
  fetchedAt: ISODate("2026-10-02T00:00:00.000Z"),
  createdAt: ISODate("2026-10-02T00:00:00.000Z"),
  updatedAt: ISODate("2026-10-02T00:00:00.000Z")
}
```

```javascript
{
  _id: ObjectId("..."),
  eventKey: "FOMC:2026-10",
  eventType: "FOMC",
  referencePeriod: "2026-10",
  sourcePeriodLabel: "October 27-28",
  sourceReleaseName: "FOMC Meeting",
  releaseAt: ISODate("2026-10-28T18:00:00.000Z"),
  sourceLocalDate: "2026-10-28",
  sourceLocalTime: "14:00",
  sourceTimeZone: "America/New_York",
  sourceAgency: "Federal Reserve",
  sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  hasProjections: false,
  sourcePageHash: "<64-character sha256>",
  fetchedAt: ISODate("2026-10-02T00:00:00.000Z"),
  createdAt: ISODate("2026-10-02T00:00:00.000Z"),
  updatedAt: ISODate("2026-10-02T00:00:00.000Z")
}
```

範例中的 `_id`、hash 與抓取時間僅表示型別，不是聲稱已存在的資料。

## 8. 容量、隱私與未來遷移

- 每年約 44 筆事件，每筆為小型文件，遠低於 MongoDB 16 MB 文件限制。
- 不含個人資料、帳號資料或憑證；官方時程為全站共用。
- 若未來要保留完整來源證據或同步批次紀錄，應另建不同生命週期的 collection，不把 HTML 塞進事件文件。
- 未來新增其他指標時，先擴充 enum、parser、validator 與索引評估，再執行 `collMod`；不直接寫入 validator 以外欄位。
