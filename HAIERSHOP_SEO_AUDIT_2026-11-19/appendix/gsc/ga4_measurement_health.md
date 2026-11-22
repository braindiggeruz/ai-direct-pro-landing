# GA4 measurement health (properties/417132707)

Summary: {"dataStreamCount": 1, "webStreamCount": 1, "keyEventCount": 6, "customDimensionCount": 0, "customMetricCount": 0, "issueCount": 0}

Issues: []

## Web streams

| field | value |
|---|---|
| streamId | 6407115122 |
| displayName | Haiershop |
| measurementId | G-H9DF7V4DMX |
| defaultUri | https://haiershop.uz |
| createTime | 2023-11-24T15:15:07.960Z |
| updateTime | 2023-11-24T15:15:07.960Z |
| enhancedMeasurement | {"streamEnabled": true, "scrollsEnabled": true, "outboundClicksEnabled": true, "siteSearchEnabled": true, "videoEngagementEnabled": true, "fileDownloadsEnabled": true, "pageChangesEnabled": true, "formInteractionsEnabled": true, "searchQueryParameter": "q,s,search,query,keyword", "uriQueryParameter": ""} |

## Key events

| eventName | createTime | custom | countingMethod |
|---|---|---|---|
| purchase | 2023-11-24T15:15:07.960369Z |  | ONCE_PER_EVENT |
| order | 2024-07-10T08:44:09.464268Z | True | ONCE_PER_EVENT |
| zvonok | 2024-07-15T11:59:41.264366Z | True | ONCE_PER_EVENT |
| mail_click | 2024-07-15T12:00:24.288046Z | True | ONCE_PER_EVENT |
| click_tg | 2024-07-15T12:00:12.790053Z | True | ONCE_PER_EVENT |
| click_tel | 2024-07-15T12:00:06.780651Z | True | ONCE_PER_EVENT |

## Custom definitions

{"dimensions": [], "metrics": []}

## Ecommerce activity check (90d, 2026-08-21..2026-11-18)

- breakdown=item, channel=organic_search: status=none, evidence={"itemsViewed": 0, "itemsAddedToCart": 0, "itemsPurchased": 0, "itemRevenue": 0}, rows=0/0
- breakdown=landing_page, channel=organic_search: status=none, evidence={"transactions": 0, "purchaseRevenue": 0}, rows=300/522
- breakdown=item, channel=all: status=none, evidence={"itemsViewed": 0, "itemsAddedToCart": 0, "itemsPurchased": 0, "itemRevenue": 0}, rows=0/0

Вывод: ключевое событие `purchase` настроено, но ecommerce-события (view_item / add_to_cart / purchase) за 90 дней не регистрируются ни в одном канале; transactions = 0 везде.
