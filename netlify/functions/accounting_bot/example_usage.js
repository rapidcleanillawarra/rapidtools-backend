/**
 * Example usage of statement_db_synchronization function
 * 
 * This file demonstrates how to use the statement_db_synchronization function
 * with sample data from the accounting_bot response.
 */

const { statement_db_synchronization } = require('./statement_db_synchronization');

// Sample accounting bot response data
const sampleAccountingBotResponse = {
    maropostData: {
        Order: [{
            OrderID: "12345",
            Username: "john.doe",
            Email: "john.doe@example.com",
            OrderStatus: "Dispatched",
            GrandTotal: "1500.00",
            DatePaymentDue: "2026-01-15",
            OrderPayment: [
                { Amount: "500.00" },
                { Amount: "300.00" }
            ]
        }]
    },
    xeroData: {
        foundCount: 1,
        invoices: [{
            total: "1500.00",
            amountPaid: "800.00",
            amountDue: "700.00"
        }]
    }
};

// Example 1: Order with partial payment and Xero data
console.log('\n========================================');
console.log('EXAMPLE 1: Partial Payment with Xero');
console.log('========================================\n');

statement_db_synchronization(sampleAccountingBotResponse)
    .then(result => {
        console.log('\nResult:', result.success ? '✓ SUCCESS' : '✗ FAILED');
        if (!result.success) {
            console.error('Error:', result.error);
        }
    })
    .catch(error => {
        console.error('Unexpected error:', error);
    });

// Example 2: Fully paid order
setTimeout(() => {
    console.log('\n========================================');
    console.log('EXAMPLE 2: Fully Paid Order');
    console.log('========================================\n');

    const fullyPaidResponse = {
        maropostData: {
            Order: [{
                OrderID: "12346",
                Username: "jane.smith",
                Email: "jane.smith@example.com",
                OrderStatus: "Dispatched",
                GrandTotal: "2000.00",
                DatePaymentDue: "2026-01-20",
                OrderPayment: [
                    { Amount: "2000.00" }
                ]
            }]
        },
        xeroData: {
            foundCount: 1,
            invoices: [{
                total: "2000.00",
                amountPaid: "2000.00",
                amountDue: "0.00"
            }]
        }
    };

    statement_db_synchronization(fullyPaidResponse)
        .then(result => {
            console.log('\nResult:', result.success ? '✓ SUCCESS' : '✗ FAILED');
        });
}, 1000);

// Example 3: Unpaid order without Xero data
setTimeout(() => {
    console.log('\n========================================');
    console.log('EXAMPLE 3: Unpaid Order (Not in Xero)');
    console.log('========================================\n');

    const unpaidResponse = {
        maropostData: {
            Order: [{
                OrderID: "12347",
                Username: "bob.wilson",
                Email: "bob.wilson@example.com",
                OrderStatus: "Dispatched",
                GrandTotal: "750.00",
                DatePaymentDue: "2026-01-10",
                OrderPayment: []
            }]
        },
        xeroData: {
            foundCount: 0,
            invoices: []
        }
    };

    statement_db_synchronization(unpaidResponse)
        .then(result => {
            console.log('\nResult:', result.success ? '✓ SUCCESS' : '✗ FAILED');
        });
}, 2000);

// Example 4: Order with balance mismatch between Maropost and Xero
setTimeout(() => {
    console.log('\n========================================');
    console.log('EXAMPLE 4: Balance Mismatch Warning');
    console.log('========================================\n');

    const mismatchResponse = {
        maropostData: {
            Order: [{
                OrderID: "12348",
                Username: "alice.brown",
                Email: "alice.brown@example.com",
                OrderStatus: "Dispatched",
                GrandTotal: "1000.00",
                DatePaymentDue: "2026-01-25",
                OrderPayment: [
                    { Amount: "400.00" }
                ]
            }]
        },
        xeroData: {
            foundCount: 1,
            invoices: [{
                total: "1000.00",
                amountPaid: "500.00", // Different from Maropost
                amountDue: "500.00"   // Mismatch: Maropost shows 600 outstanding
            }]
        }
    };

    statement_db_synchronization(mismatchResponse)
        .then(result => {
            console.log('\nResult:', result.success ? '✓ SUCCESS' : '✗ FAILED');
            console.log('\n========================================');
            console.log('ALL EXAMPLES COMPLETED');
            console.log('========================================\n');
        });
}, 3000);
