require('dotenv').config();
const { Mistral } = require('@mistralai/mistralai');

async function testKeys() {
    console.log("--- Testing Mistral API Key Distribution ---");

    const keys = {
        primary: process.env.MISTRAL_API_KEY,
        sifter: process.env.MISTRAL_API_KEY_SIFTER,
        sidecar: process.env.MISTRAL_API_KEY_SIDECAR
    };

    for (const [name, key] of Object.entries(keys)) {
        if (!key) {
            console.error(`[FAIL] ${name} key is missing in .env`);
            continue;
        }

        console.log(`\nTesting ${name.toUpperCase()} key...`);
        const client = new Mistral({ apiKey: key });

        try {
            const response = await client.chat.complete({
                model: "mistral-small-latest",
                messages: [{ role: 'user', content: 'Respond with "OK"' }],
            });
            console.log(`[SUCCESS] ${name.toUpperCase()} responded: ${response.choices[0].message.content}`);
        } catch (err) {
            console.error(`[ERROR] ${name.toUpperCase()} failed:`, err.message);
        }
    }
}

testKeys();
