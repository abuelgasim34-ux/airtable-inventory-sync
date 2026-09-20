const express = require('express');
const Airtable = require('airtable');

const app = express();
app.use(express.json());

// Initialize secure cross-cloud authorization tokens
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

app.post('/webhook/inventory-sync', async (req, res) => {
    console.log('📥 Inbound webhook event captured. Initializing ledger computations...');
    
    try {
        // 1. Fetch data arrays asynchronously from the M:N Junction table
        const lineItems = await base('Line Items').select({
            filterByFormula: "{Order Status} = 'Approved'"
        }).all();

        if (lineItems.length === 0) {
            console.log('⚪ Process halted: No pending rows found matching selection tokens.');
            return res.status(200).json({ success: true, message: 'Zero operational items require synchronization.' });
        }

        // 2. Reduce unstructured line items into a unified SKU deduction map
        const stockDeductions = lineItems.reduce((acc, record) => {
            const skuArray = record.get('Product Linked'); // Rollup/Linked array
            const sku = skuArray && skuArray.length > 0 ? skuArray[0] : null;
            const quantity = Number(record.get('Quantity Ordered')) || 0;

            if (sku && quantity > 0) {
                acc[sku] = (acc[sku] || 0) + quantity;
            }
            return acc;
        }, {});

        // 3. Fetch active catalog numbers from the target Inventory table
        const productRecords = await base('Products').select().all();
        
        // 4. Map deductions precisely against active catalog stock layers
        const updatePayload = productRecords.map(record => {
            const sku = record.get('SKU');
            if (stockDeductions[sku]) {
                const currentStock = Number(record.get('Starting Stock')) || 0;
                const deduction = stockDeductions[sku];
                return {
                    id: record.id,
                    fields: {
                        'Starting Stock': Math.max(0, currentStock - deduction) // Prevent negative physical counts
                    }
                };
            }
            return null;
        }).filter(Boolean);

        // 5. CRITICAL CONSTRAINT: Process structural bulk mutations in exact blocks of 50 records
        if (updatePayload.length > 0) {
            for (let i = 0; i < updatePayload.length; i += 50) {
                const chunk = updatePayload.slice(i, i + 50);
                await base('Products').update(chunk);
                console.log(`📦 Pushed chunk matrix: Processed items ${i + 1} to ${Math.min(i + 50, updatePayload.length)} successfully.`);
            }
            console.log('✅ Success! Synchronized deductions across product SKUs.');
            return res.status(200).json({ success: true, message: `Deductions processed for ${updatePayload.length} updates.` });
        } else {
            console.log('⚪ Sync terminated: Calculated variations match current stock inventory scales.');
            return res.status(200).json({ success: true, message: 'Calculated ledger properties require zero variation.' });
        }

    } catch (error) {
        console.error('❌ Critical runtime exception encountered inside mutation pipeline:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Automated Ledger Service is listening on port ${PORT}`));



