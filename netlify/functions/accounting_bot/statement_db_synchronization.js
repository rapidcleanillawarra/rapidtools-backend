const { supabase } = require('../utils/supabaseInit');

/**
 * Statement DB Synchronization
 * 
 * This function processes accounting bot response data to prepare records for the statement_of_accounts table.
 * It calculates invoice totals and deducts payments to determine outstanding balances.
 * 
 * Expected input structure from accounting_bot response:
 * {
 *   maropostData: {
 *     Order: [{
 *       OrderID: string,
 *       Username: string,
 *       Email: string,
 *       GrandTotal: number,
 *       OrderPayment: [{ Amount: number }],
 *       OrderStatus: string,
 *       DatePaymentDue: string (optional)
 *     }]
 *   },
 *   xeroData: {
 *     invoices: [{
 *       total: number,
 *       amountPaid: number,
 *       amountDue: number
 *     }]
 *   }
 * }
 * 
 * @param {Object} accountingBotResponse - Response data from accounting_bot function
 * @returns {Object} Prepared database record with calculations
 */
const statement_db_synchronization = async (accountingBotResponse) => {
    console.log('=== Statement DB Synchronization Started ===');
    console.log('Timestamp:', new Date().toISOString());

    try {
        // Validate input
        if (!accountingBotResponse) {
            throw new Error('accountingBotResponse is required');
        }

        const { maropostData, xeroData } = accountingBotResponse;

        // Validate maropostData structure
        if (!maropostData || !maropostData.Order || !Array.isArray(maropostData.Order) || maropostData.Order.length === 0) {
            throw new Error('Invalid maropostData structure: Order array is required');
        }

        const order = maropostData.Order[0];

        // Extract order details
        const orderId = order.OrderID;
        const username = order.Username;
        const email = order.Email || '';
        const orderStatus = order.OrderStatus || 'unknown';
        const datePaymentDue = order.DatePaymentDue || null;

        // Calculate Maropost totals
        const grandTotal = parseFloat(order.GrandTotal || 0);
        const paymentsArray = order.OrderPayment && Array.isArray(order.OrderPayment) 
            ? order.OrderPayment 
            : [];
        
        const paymentsSum = paymentsArray.reduce((sum, payment) => {
            return sum + parseFloat(payment.Amount || 0);
        }, 0);

        const outstandingAmount = grandTotal - paymentsSum;

        // Determine payment status
        let paymentStatus;
        if (grandTotal === 0) {
            paymentStatus = "free";
        } else if (paymentsSum === grandTotal) {
            paymentStatus = "paid";
        } else if (paymentsSum > grandTotal) {
            paymentStatus = "overpaid";
        } else if (paymentsSum > 0) {
            paymentStatus = "partial";
        } else {
            paymentStatus = "unpaid";
        }

        // Check if order is past due
        let isPastDue = false;
        if (datePaymentDue) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDate = new Date(datePaymentDue);
            dueDate.setHours(0, 0, 0, 0);
            isPastDue = dueDate < today;
        }

        // Extract Xero data if available
        const exportedToXero = xeroData && xeroData.invoices && Array.isArray(xeroData.invoices) && xeroData.invoices.length > 0;
        let xeroTotal = null;
        let xeroAmountPaid = null;
        let xeroAmountDue = null;
        let xeroPaymentStatus = "not_exported";

        if (exportedToXero) {
            const xeroInvoice = xeroData.invoices[0];
            xeroTotal = parseFloat(xeroInvoice.total || 0);
            xeroAmountPaid = parseFloat(xeroInvoice.amountPaid || 0);
            xeroAmountDue = parseFloat(xeroInvoice.amountDue || 0);

            // Determine Xero payment status
            if (xeroTotal === xeroAmountPaid && xeroAmountDue === 0) {
                xeroPaymentStatus = "paid";
            } else if (xeroAmountPaid === 0 && xeroAmountDue === 0 && xeroTotal === 0) {
                xeroPaymentStatus = "free";
            } else if (xeroAmountPaid === 0 && xeroAmountDue > 0) {
                xeroPaymentStatus = "unpaid";
            } else if (xeroTotal !== xeroAmountPaid) {
                xeroPaymentStatus = xeroAmountDue > 0 ? "partial" : "overpaid";
            } else {
                xeroPaymentStatus = "unknown";
            }
        }

        // Check for balance mismatch between Maropost and Xero
        const balanceMismatch = exportedToXero && Math.abs(outstandingAmount - xeroAmountDue) > 0.01;

        // Prepare database record
        const dbRecord = {
            order_id: orderId,
            customer_username: username,
            email: email,
            order_status: orderStatus,
            grand_total: grandTotal,
            payments_sum: paymentsSum,
            outstanding_amount: outstandingAmount,
            payment_status: paymentStatus,
            date_payment_due: datePaymentDue,
            is_past_due: isPastDue,
            exported_to_xero: exportedToXero,
            xero_total: xeroTotal,
            xero_amount_paid: xeroAmountPaid,
            xero_amount_due: xeroAmountDue,
            xero_payment_status: xeroPaymentStatus,
            balance_mismatch: balanceMismatch,
            last_updated: new Date().toISOString()
        };

        // Log the prepared record for verification
        console.log('\n=== CALCULATED RECORD ===');
        console.log('Order ID:', dbRecord.order_id);
        console.log('Customer Username:', dbRecord.customer_username);
        console.log('Email:', dbRecord.email);
        console.log('Order Status:', dbRecord.order_status);
        console.log('\n--- MAROPOST CALCULATIONS ---');
        console.log('Grand Total:', `$${dbRecord.grand_total.toFixed(2)}`);
        console.log('Payments Sum:', `$${dbRecord.payments_sum.toFixed(2)}`);
        console.log('Outstanding Amount:', `$${dbRecord.outstanding_amount.toFixed(2)}`);
        console.log('Payment Status:', dbRecord.payment_status);
        console.log('Date Payment Due:', dbRecord.date_payment_due || 'Not set');
        console.log('Is Past Due:', dbRecord.is_past_due);
        
        if (exportedToXero) {
            console.log('\n--- XERO CALCULATIONS ---');
            console.log('Xero Total:', `$${dbRecord.xero_total.toFixed(2)}`);
            console.log('Xero Amount Paid:', `$${dbRecord.xero_amount_paid.toFixed(2)}`);
            console.log('Xero Amount Due:', `$${dbRecord.xero_amount_due.toFixed(2)}`);
            console.log('Xero Payment Status:', dbRecord.xero_payment_status);
            console.log('\n--- COMPARISON ---');
            console.log('Balance Mismatch:', dbRecord.balance_mismatch ? 'YES ⚠️' : 'NO ✓');
            if (dbRecord.balance_mismatch) {
                const difference = Math.abs(dbRecord.outstanding_amount - dbRecord.xero_amount_due);
                console.log('Difference:', `$${difference.toFixed(2)}`);
            }
        } else {
            console.log('\n--- XERO STATUS ---');
            console.log('Exported to Xero:', 'NO - Invoice not found in Xero');
        }

        console.log('\n--- PAYMENT DETAILS ---');
        console.log('Number of Payments:', paymentsArray.length);
        if (paymentsArray.length > 0) {
            paymentsArray.forEach((payment, index) => {
                console.log(`  Payment ${index + 1}:`, `$${parseFloat(payment.Amount || 0).toFixed(2)}`);
            });
        }

        console.log('\n=== DATABASE SAVE DISABLED ===');
        console.log('Record prepared but not saved to database (as requested)');
        console.log('To enable saving, uncomment the database insert code below');
        console.log('========================\n');

        // Database save is disabled - uncomment below to enable
        /*
        if (!supabase) {
            throw new Error('Supabase client not initialized');
        }

        const { data, error } = await supabase
            .from('statement_of_accounts')
            .insert([dbRecord])
            .select();

        if (error) {
            throw new Error(`Failed to insert record: ${error.message}`);
        }

        console.log('Record successfully saved to database:', data);
        return { success: true, data: data[0] };
        */

        return { 
            success: true, 
            message: 'Record prepared successfully (not saved to database)',
            record: dbRecord 
        };

    } catch (error) {
        console.error('=== ERROR in statement_db_synchronization ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
};

module.exports = { statement_db_synchronization };
