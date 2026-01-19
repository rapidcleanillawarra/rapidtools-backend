const { processCustomerData } = require('./statement_db_synchronization');

// Provided example response from the user
const exampleResponse = {
    "success": true,
    "message": "Synchronization completed successfully",
    "stats": {
        "customer_api_usernames": 25,
        "order_api_unique_username": 18,
        "matched_balances_count": 15,
        "unmatched_balances_count": 10
    },
    "customers": [
        {
            "customer_username": "customer_a",
            "email": "customer_a@example.com",
            "company_name": "ABC Corporation",
            "orders": [
                {
                    "id": "ORD-001",
                    "grandTotal": 1000.00,
                    "payments": [
                        {
                            "Amount": 250.00
                        }
                    ],
                    "outstandingAmount": 750.00,
                    "datePaymentDue": "2025-12-15T00:00:00.000Z",
                    "isPastDue": true
                },
                {
                    "id": "ORD-002",
                    "grandTotal": 800.00,
                    "payments": [
                        {
                            "Amount": 400.00
                        },
                        {
                            "Amount": 150.00
                        }
                    ],
                    "outstandingAmount": 250.00,
                    "datePaymentDue": "2026-02-01T00:00:00.000Z",
                    "isPastDue": false
                },
                {
                    "id": "ORD-003",
                    "grandTotal": 500.00,
                    "payments": [],
                    "outstandingAmount": 500.50, // Note: This has 0.50 extra than calc (500-0=500), let's see if our logic catches it!
                    "datePaymentDue": "2026-01-20T00:00:00.000Z",
                    "isPastDue": false
                }
            ]
        },
        {
            "customer_username": "customer_b",
            "email": "customer_b@company.com",
            "orders": [
                {
                    "id": "ORD-004",
                    "grandTotal": 2000.00,
                    "payments": [
                        {
                            "Amount": 500.00
                        }
                    ],
                    "outstandingAmount": 1500.00,
                    "datePaymentDue": "2025-11-30T00:00:00.000Z",
                    "isPastDue": true
                },
                {
                    "id": "ORD-005",
                    "grandTotal": 1500.00,
                    "payments": [
                        {
                            "Amount": 249.25
                        }
                    ],
                    "outstandingAmount": 1250.75,
                    "datePaymentDue": "2026-01-25T00:00:00.000Z",
                    "isPastDue": false
                }
            ]
        },
        {
            "customer_username": "customer_c",
            "orders": [
                {
                    "id": "ORD-006",
                    "grandTotal": 100.00,
                    "payments": [
                        {
                            "Amount": 100.00
                        }
                    ],
                    "outstandingAmount": 0.00,
                    "datePaymentDue": "2026-01-10T00:00:00.000Z",
                    "isPastDue": false
                }
            ]
        },
        {
            "customer_username": "customer_e",
            "orders": [
                {
                    "id": "ORD-007",
                    "grandTotal": 1200.00,
                    "payments": [],
                    "outstandingAmount": 1200.00,
                    "datePaymentDue": "2025-12-01T00:00:00.000Z",
                    "isPastDue": true
                },
                {
                    "id": "ORD-008",
                    "grandTotal": 800.00,
                    "payments": [
                        {
                            "Amount": 200.00
                        },
                        {
                            "Amount": 300.00
                        },
                        {
                            "Amount": 300.00
                        }
                    ],
                    "outstandingAmount": 0.00,
                    "datePaymentDue": "2026-03-15T00:00:00.000Z",
                    "isPastDue": false
                }
            ]
        }
    ]
};

console.log('=== RUNNING TEST WITH EXAMPLE DATA ===');
const { processedRecords, totalOrders, stats } = processCustomerData(exampleResponse.customers);

console.log('\n=== TEST SUMMARY ===');
console.log(`Total Orders Processed: ${totalOrders}`);
console.log(`Processed Records: ${processedRecords.length}`);
console.log(`Customers with Zero Balance: ${stats.customersWithZeroBalance}`);
console.log(`Customers with Balance: ${stats.customersWithBalance}`);

// Check for discrepancies
const discrepancies = processedRecords.filter(r => r.discrepancy_detected);
if (discrepancies.length > 0) {
    console.log(`\n⚠️ DISCREPANCIES FOUND: ${discrepancies.length}`);
    discrepancies.forEach(d => {
        console.log(`- Order ${d.order_id} (${d.customer_username}): Outstanding ${d.outstanding_amount}`);
    });
} else {
    console.log('\n✅ No discrepancies found.');
}

