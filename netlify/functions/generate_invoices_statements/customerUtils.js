/**
 * Filter customers by account balance
 * @param {Array} customers - Array of customer objects from API
 * @returns {Array} Filtered array of customers with AccountBalance > 0 (excludes negative balances)
 */
const filterCustomersByBalance = (customers) => {
    if (!Array.isArray(customers)) {
        return [];
    }

    return customers.filter(customer => {
        const balance = parseFloat(customer.AccountBalance || 0);
        return balance > 0;
    });
};

/**
 * Format customer name from BillingAddress
 * @param {Object} billingAddress - BillingAddress object from API
 * @returns {string} Formatted customer name: "BillFirstName BillLastName (BillCompany)"
 */
const formatCustomerNameFromBillingAddress = (billingAddress) => {
    if (!billingAddress) {
        return null;
    }

    const firstName = billingAddress.BillFirstName || '';
    const lastName = billingAddress.BillLastName || '';
    const company = billingAddress.BillCompany || '';

    // Format: "BillFirstName BillLastName (BillCompany)"
    const nameParts = [firstName, lastName].filter(part => part && part.trim() !== '');
    const fullName = nameParts.join(' ');

    if (company && fullName) {
        return `${fullName} (${company})`;
    } else if (fullName) {
        return fullName;
    } else if (company) {
        return company;
    }

    return null;
};

/**
 * Fetch customer data by username from Power Automate API
 * @param {string} username - Customer username
 * @returns {Object|null} Customer data or null if not found
 */
const fetchCustomerByUsername = async (username) => {
    const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Filter: {
                    Username: username,
                    OutputSelector: [
                        "Username",
                        "EmailAddress",
                        "BillingAddress",
                        "AccountBalance"
                    ]
                },
                action: "GetCustomer"
            })
        });

        if (!response.ok) {
            console.error(`Failed to fetch customer ${username}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const customers = data?.Customer || [];
        return customers.length > 0 ? customers[0] : null;
    } catch (error) {
        console.error(`Error fetching customer ${username}:`, error);
        return null;
    }
};

module.exports = { filterCustomersByBalance, formatCustomerNameFromBillingAddress, fetchCustomerByUsername };
