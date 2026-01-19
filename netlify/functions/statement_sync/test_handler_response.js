const { handler } = require('./statement_db_synchronization');

// Mock global fetch
global.fetch = async () => ({
    ok: true,
    json: async () => ({
        success: true,
        message: "Mock external API response",
        stats: {
            customer_api_usernames: 25,
            order_api_unique_username: 18,
            matched_balances_count: 15,
            unmatched_balances_count: 10,
            usernames_with_unmatched_balances: ["test_user"]
        },
        customers: [
            {
                customer_username: "test_customer",
                email: "test@example.com",
                orders: []
            }
        ]
    })
});

// Mock console to keep output clean, or let it log
// console.log = () => {}; 

const runTest = async () => {
    console.log('--- Invoking Handler ---');
    const response = await handler({ httpMethod: 'POST' });

    console.log('\n--- Handler Response Body ---');
    const body = JSON.parse(response.body);
    console.log(JSON.stringify(body, null, 2));

    // verification
    const forbiddenKeys = [
        'usernames_with_unmatched_balances',
        'matched_balances_count',
        'unmatched_balances_count',
        'customers'
    ];

    let unexpectedFound = false;

    // Check top level
    forbiddenKeys.forEach(key => {
        if (body[key]) {
            console.error(`❌ FOUND FORBIDDEN KEY AT TOP LEVEL: ${key}`);
            unexpectedFound = true;
        }
    });

    // Check stats level
    if (body.stats) {
        forbiddenKeys.forEach(key => {
            if (body.stats[key]) {
                console.error(`❌ FOUND FORBIDDEN KEY IN STATS: ${key}`);
                unexpectedFound = true;
            }
        });
    }

    if (!unexpectedFound) {
        console.log('\n✅ Verification PASSED: No forbidden keys found in response.');
    } else {
        console.log('\n❌ Verification FAILED: Forbidden keys found.');
    }
};

runTest();
