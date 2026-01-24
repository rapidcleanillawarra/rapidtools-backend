---
name: Add metadata to data response
overview: Add folder_name, file_name, customer_username, and created_by fields to the "data" display response with proper date formatting
todos:
  - id: "1"
    content: Add formatFolderDate() helper function to format date as lowercase month_name_day_year with underscores
    status: completed
  - id: "2"
    content: Add formatFileNameDate() helper function to format date as day_month_year with numeric month
    status: completed
  - id: "3"
    content: Update the data display response to include folder_name, file_name, customer_username, and created_by fields
    status: completed
---

## Changes to `maropost_order_notification.js`

### 1. Add date formatting helper functions

Create two helper functions for date formatting:

- `formatFolderDate()`: Returns date in format "january_24_2026" (lowercase month name, underscores)
- `formatFileNameDate()`: Returns date in format "24_01_2026" (day_month_year with numeric month)

### 2. Update the "data" display response

Modify the response at lines 1387-1397 to include:

- `folder_name`: "Sent Invoices/{formatted_date}" where formatted_date uses current date
- `file_name`: "{order_id}-{customer_username}-{formatted_date}"
- `customer_username`: From `orderDetails?.Order?.[0]?.Username`
- `created_by`: Static value "Power Automate"

### Implementation details:

- Use `new Date()` to get current date (not order date)
- Extract username from `orderDetails?.Order?.[0]?.Username` (fallback to empty string if not available)
- Format folder date as lowercase month name with underscores (e.g., "january_24_2026")
- Format file name date as numeric day_month_year (e.g., "24_01_2026")
- Ensure order_id is available from `payload.OrderID`

### Example response structure:

```json
{
  "order_id": "26-0011994",
  "customer_username": "john.doe",
  "folder_name": "Sent Invoices/january_24_2026",
  "file_name": "26-0011994-john.doe-24_01_2026",
  "created_by": "Power Automate",
  "email_html": "...",
  "pdf_html": "..."
}
```