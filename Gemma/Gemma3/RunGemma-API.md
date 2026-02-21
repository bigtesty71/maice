# Run Gemma with the Gemini API- Python

The Gemini API provides hosted access to Gemma as a programming API you can use in application development or prototyping. This API is a convenient alternative to setting up your own local instance of Gemma and web service to handle generative AI tasks.

The following examples show how to use Gemma with the Gemini API:

[Python](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api#python)

[Node.js](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api#node.js)

[REST](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api#rest)

`from google import genai`

`client = genai.Client(api_key="YOUR_API_KEY")`

`response = client.models.generate_content(`  
    `model="gemma-3-27b-it",`  
    `contents="Roses are red...",`  
`)`

`print(response.text)`

[Get API Key](https://aistudio.google.com/apikey)

**Important:** You must obtain an API key to use the Gemini API, which you can get from the Google [AI Studio](https://aistudio.google.com/apikey) application.

You can access the Gemini API on many platforms, such as mobile, web, and cloud services, and with multiple programming languages. For more information on Gemini API SDK packages, see the Gemini API [SDK downloads](https://ai.google.dev/gemini-api/docs/downloads) page. For a general introduction to the Gemini API, see the [Gemini API quickstart](https://ai.google.dev/gemini-api/docs/quickstart).

## Image Understanding

Gemma 3 models can process images, enabling many frontier developer use cases that would have historically required domain specific models.

The following examples show how to use Gemma Image inputs with the Gemini API:

[Python](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api#python)

[Node.js](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api#node.js)

[REST](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api#rest)

`from google import genai`

`client = genai.Client(api_key="YOUR_API_KEY")`

`my_file = client.files.upload(file="path/to/sample.jpg")`

`response = client.models.generate_content(`  
    `model="gemma-3-27b-it",`  
    `contents=[my_file, "Caption this image."],`  
`)`

`print(response.text)`

For a general introduction to the Gemini API Image Understanding capabilities, see the [Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) guide.

# Run Gemma with the Gemini API-Node.js

The Gemini API provides hosted access to Gemma as a programming API you can use in application development or prototyping. This API is a convenient alternative to setting up your own local instance of Gemma and web service to handle generative AI tasks.

The following examples show how to use Gemma with the Gemini API:

`import { GoogleGenAI } from "@google/genai";`

`const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY"});`

`const response = await ai.models.generateContent({`  
  `model: "gemma-3-27b-it",`  
  `contents: "Roses are red...",`  
`});`  
`console.log(response.text);`

[Get API Key](https://aistudio.google.com/apikey)

**Important:** You must obtain an API key to use the Gemini API, which you can get from the Google [AI Studio](https://aistudio.google.com/apikey) application.

You can access the Gemini API on many platforms, such as mobile, web, and cloud services, and with multiple programming languages. For more information on Gemini API SDK packages, see the Gemini API [SDK downloads](https://ai.google.dev/gemini-api/docs/downloads) page. For a general introduction to the Gemini API, see the [Gemini API quickstart](https://ai.google.dev/gemini-api/docs/quickstart).

## 

## 

## 

## Image Understanding

Gemma 3 models can process images, enabling many frontier developer use cases that would have historically required domain specific models.

The following examples show how to use Gemma Image inputs with the Gemini API:

`import {`  
  `GoogleGenAI,`  
  `createUserContent,`  
  `createPartFromUri,`  
`} from "@google/genai";`

`const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });`

`const myfile = await ai.files.upload({`  
  `file: "path/to/sample.jpg",`  
  `config: { mimeType: "image/jpeg" },`  
`});`

`const response = await ai.models.generateContent({`  
  `model: "gemma-3-27b-it",`  
  `contents: createUserContent([`  
    `createPartFromUri(myfile.uri, myfile.mimeType),`  
    `"Caption this image.",`  
  `]),`  
`});`  
`console.log(response.text);`

 Run Gemma with the Gemini API-Rest

The Gemini API provides hosted access to Gemma as a programming API you can use in application development or prototyping. This API is a convenient alternative to setting up your own local instance of Gemma and web service to handle generative AI tasks.

The following examples show how to use Gemma with the Gemini API:

`curl "https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=YOUR_API_KEY" \`

`-H 'Content-Type: application/json' \`

`-X POST \`

`-d '{`

  `"contents": [{`

    `"parts":[{"text": "Roses are red..."}]`

    `}]`

   `}'`

[Get API Key](https://aistudio.google.com/apikey)

**Important:** You must obtain an API key to use the Gemini API, which you can get from the Google [AI Studio](https://aistudio.google.com/apikey) application.

You can access the Gemini API on many platforms, such as mobile, web, and cloud services, and with multiple programming languages. For more information on Gemini API SDK packages, see the Gemini API [SDK downloads](https://ai.google.dev/gemini-api/docs/downloads) page. For a general introduction to the Gemini API, see the [Gemini API quickstart](https://ai.google.dev/gemini-api/docs/quickstart).

## Image Understanding

Gemma 3 models can process images, enabling many frontier developer use cases that would have historically required domain specific models.

The following examples show how to use Gemma Image inputs with the Gemini API:

`IMAGE_PATH="cats-and-dogs.jpg"`

`MIME_TYPE=$(file -b --mime-type "${IMAGE_PATH}")`

`NUM_BYTES=$(wc -c < "${IMAGE_PATH}")`

`DISPLAY_NAME=IMAGE`

`tmp_header_file=upload-header.tmp`

`# Initial resumable request defining metadata.`

`# The upload url is in the response headers dump them to a file.`

`curl "https://generativelanguage.googleapis.com/upload/v1beta/files?key=YOUR_API_KEY" \`

  `-D upload-header.tmp \`

  `-H "X-Goog-Upload-Protocol: resumable" \`

  `-H "X-Goog-Upload-Command: start" \`

  `-H "X-Goog-Upload-Header-Content-Length: ${NUM_BYTES}" \`

  `-H "X-Goog-Upload-Header-Content-Type: ${MIME_TYPE}" \`

  `-H "Content-Type: application/json" \`

  `-d "{'file': {'display_name': '${DISPLAY_NAME}'}}" 2> /dev/null`

`upload_url=$(grep -i "x-goog-upload-url: " "${tmp_header_file}" | cut -d" " -f2 | tr -d "\r")`

`rm "${tmp_header_file}"`

`# Upload the actual bytes.`

`curl "${upload_url}" \`

  `-H "Content-Length: ${NUM_BYTES}" \`

  `-H "X-Goog-Upload-Offset: 0" \`

  `-H "X-Goog-Upload-Command: upload, finalize" \`

  `--data-binary "@${IMAGE_PATH}" 2> /dev/null > file_info.json`

`file_uri=$(jq -r ".file.uri" file_info.json)`

`echo file_uri=$file_uri`

`# Now generate content using that file`

`curl "https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=YOUR_API_KEY" \`

    `-H 'Content-Type: application/json' \`

    `-X POST \`

    `-d '{`

      `"contents": [{`

        `"parts":[`

          `{"file_data":{"mime_type": "'"${MIME_TYPE}"'", "file_uri": "'"${file_uri}"'"}},`

          `{"text": "Caption this image."}]`

        `}]`

      `}' 2> /dev/null > response.json`

`cat response.json`

`echo`

`jq -r ".candidates[].content.parts[].text" response.json`

