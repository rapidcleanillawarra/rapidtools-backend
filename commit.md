# fix(accounting-bot): Correct RGB color implementation

This commit fixes the incorrect RGB color conversion and ensures all color values are properly defined in RGB format.

## Files Modified:

### 1. `netlify/functions/accounting_bot.js`
- **Fixed**: Replaced all hex color definitions with direct RGB values
- **Removed**: Broken regex-based hex-to-RGB conversion in template
- **Why**: Original implementation incorrectly converted colors and left some hex values
- **Impact**: Maintains identical visual output while using proper RGB syntax
- **Diff**:
  ```diff
  - case "paid": return "#4CAF50";
  + case "paid": return "rgb(76, 175, 80)";
  
  - const maropost_paid_status_font = ["paid", "free", "unpaid"].includes(maropost_paid_status) ? "#FFFFFF" : "#000000";
  + const maropost_paid_status_font = ["paid", "free", "unpaid"].includes(maropost_paid_status) ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
  
  - <b><strong style="background: ${total_background.replace('#', 'rgb(').replace(/(..)(..)(..)/, '$1, $2, $3)')};
  + <b><strong style="background: ${total_background};
  ```

## Technical Improvements:
- **Before**: Mixed hex/RGB with broken conversion logic
- **After**: Consistent RGB usage with proper color definitions
- **Performance**: Eliminates unnecessary string conversions
- **Maintainability**: Clearer color definitions in code

## Testing Instructions:
1. Trigger the `/accounting_bot` endpoint with test data
2. Verify all status colors render correctly (paid=green, unpaid=red, etc.)
3. Inspect response HTML to confirm proper RGB values
4. Test edge cases (missing data, mismatched totals)

## Notes:
- **No breaking changes**: Visual output remains identical
- **Error handling**: Unaffected by these changes
- **Deployment**: No special requirements

## Additional Context:
- **Related Issues**: N/A
- **Dependencies**: None
- **Deployment Requirements**: None 