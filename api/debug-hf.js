const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

async function testHF() {
  try {
    const token = process.env.HF_TOKEN;
    console.log('Token present:', !!token);
    if (!token) {
      console.error('No HF_TOKEN found in environment');
      return;
    }

    const hf = new HfInference(token);
    const model = 'HuggingFaceH4/zephyr-7b-beta';

    console.log('Testing HfInference with chatCompletion...');
    console.log('Model:', model);

    const result = await hf.chatCompletion({
      model: model,
      messages: [
        {
          role: 'user',
          content: 'Hello, how are you?',
        },
      ],
      max_tokens: 200,
    });

    console.log('Success! Result type:', typeof result);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('=== ERROR ===');
    console.error('Message:', error.message);
    console.error('Status:', error.status);
    console.error('StatusCode:', error.statusCode);
    console.error('Full error:', error);
  }
}

testHF();
