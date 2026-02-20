require('dotenv').config();
const { Mistral } = require('@mistralai/mistralai');

async function testMistral() {
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

    try {
        console.log("Sending test request to Mistral...");
        const response = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [{ role: 'user', content: 'Hello, world!' }],
        });

        console.log("Response received:");
        console.log(JSON.stringify(response, null, 2));

        if (response.usage) {
            console.log("Usage found:", response.usage);
        } else {
            console.log("Usage field NOT found in response.");
        }
    } catch (err) {
        console.error("Error:", err);
    }
}

testMistral();
