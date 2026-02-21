# Gemma 3 model overview

Gemma is a family of generative artificial intelligence (AI) models and you can use them in a wide variety of generation tasks, including question answering, summarization, and reasoning. Gemma models are provided with open weights and permit responsible [commercial use](https://ai.google.dev/gemma/terms), allowing you to tune and deploy them in your own projects and applications.

The Gemma 3 release includes the following key features:

* [**Image and text input**](https://ai.google.dev/gemma/docs/core#multimodal-input): Multimodal capabilities let you input images and text to understand and analyze visual data. [Start building](https://ai.google.dev/gemma/docs/core/keras_inference)  
* [**128K token context**](https://ai.google.dev/gemma/docs/core#128k-context): Significantly large input context for analyzing more data and solving more complex problems.  
* [**Function calling**](https://ai.google.dev/gemma/docs/core#function-calling): Build natural language interfaces for working with programming interfaces. [Start building](https://ai.google.dev/gemma/docs/capabilities/function-calling)  
* [**Wide language support**](https://ai.google.dev/gemma/docs/core#multilingual): Work in your language or expand your AI application's language capabilities with support for over 140 languages. [Start building](https://ai.google.dev/gemma/docs/spoken-language)  
* [**Developer friendly model sizes**](https://ai.google.dev/gemma/docs/core#sizes): Choose a model size (270M, 1B, 4B, 12B, 27B) and precision level that works best for your task and compute resources.

You can download Gemma 3 models from [Kaggle](https://www.kaggle.com/models?query=gemma3&publisher=google) and [Hugging Face](https://huggingface.co/collections/google/gemma-3-release-67c6c6f89c4f76621268bb6d). For more technical details on Gemma 3, see the [Model Card](https://ai.google.dev/gemma/docs/core/model_card_3) and [Technical Report](https://goo.gle/Gemma3Report). Earlier versions of Gemma core models are also available for download. For more information, see [Previous Gemma models](https://ai.google.dev/gemma/docs/core#previous-models).

[Get it on Kaggle](https://www.kaggle.com/models?query=gemma3&publisher=google) [Get it on Hugging Face](https://huggingface.co/collections/google/gemma-3-release-67c6c6f89c4f76621268bb6d)

## Multimodal image and text input

You can tackle complex analysis and generation tasks with Gemma 3 with its ability to handle image and text data. You can use the model to interpret image data, identify objects, extract text data, and complete many other visual input to text output tasks. [Start building](https://ai.google.dev/gemma/docs/core/keras_inference)

**Important:** The Gemma 3 270M and 1B models are text only and *do not support image input*.

## 128K token context window

Gemma 3 models (4B, 12B, and 27B) can handle prompt inputs up to 128K tokens, a 16x larger context window than previous Gemma models. The large number of tokens means you can process several, multi page articles, larger single articles, or hundreds of images in a single prompt.

**Important:** The Gemma 3 270M and 1B models can process up to 32k tokens.

## Wide language support

Work in your own language with built-in support for over 140 languages. Gemma 3 is trained to support a large number of languages compared to previous Gemma versions, letting you take on more visual and text tasks in the languages your customers use. [Start building](https://ai.google.dev/gemma/docs/spoken-language)

## Function calling

Build intelligent, natural language controls for programming interfaces. Gemma 3 lets you define coding functions with specific syntax and constraints, and the model can call these functions to complete tasks. [Start building](https://ai.google.dev/gemma/docs/capabilities/function-calling)

## Parameter sizes and quantization

Gemma 3 models are available in 5 parameter sizes: 270M, 1B, 4B, 12B, and 27B. The models can be used with their default precision (16-bit) or with a lower precision using quantization. The different sizes and precisions represent a set of trade-offs for your AI application. Models with higher parameters and bit counts (higher precision) are generally more capable, but are more expensive to run in terms of processing cycles, memory cost and power consumption. Models with lower parameters and bit counts (lower precision) have less capabilities, but may be sufficient for your AI task.

For all Gemma 3 models, [Quantization-Aware Trained](https://developers.googleblog.com/en/gemma-3-quantized-aware-trained-state-of-the-art-ai-to-consumer-gpus/) checkpoints are provided, which allow quantizing (reducing the precision), while preserving high-quality.

The following table details the approximate GPU or TPU memory requirements for running inference with each size of the Gemma 3 model versions. Note that the numbers may changed based on inference tool.

| Parameters | BF16 (16-bit) | SFP8 (8-bit) | Q4\_0 (4-bit) |
| :---- | :---- | :---- | :---- |
| Gemma 3 270M (*text only*) | 400 MB | 297 MB | 240 MB |
| Gemma 3 1B (*text only*) | 1.5 GB | 1.1 GB | 892 MB |
| Gemma 3 4B | 6.4 GB | 4.4 GB | 3.4 GB |
| Gemma 3 12B | 20 GB | 12.2 GB | 8.7 GB |
| Gemma 3 27B | 46.4 GB | 29.1 GB | 21 GB |

**Table 1\.** Approximate GPU or TPU memory required to load Gemma 3 models based on parameter count and quantization level.

**Caution:** These estimates only include the memory required to load the models. They don't include the additional memory required for the prompt tokens or supporting software.

Memory consumption increases based on the total number of tokens required for the prompt you run. The larger the number of tokens required to process your prompt, the higher the memory required, which is in addition to the memory required to load the model.

**Note:** Memory requirements for *fine-tuning* Gemma models are significantly higher than running inference. The requirements depend on the development framework and tuning technique you use, such as Low Rank Adapter (LoRA) versus full-precision tuning.

## Previous Gemma models

You can work with previous generations of Gemma models, which are also available from [Kaggle](https://www.kaggle.com/models?query=gemma) and [Hugging Face](https://huggingface.co/collections/google/gemma-3-release-67c6c6f89c4f76621268bb6d). For more technical details about previous Gemma models, see the following model card pages:

* Gemma 2 [Model Card](https://ai.google.dev/gemma/docs/core/model_card_2)  
* Gemma 1 [Model Card](https://ai.google.dev/gemma/docs/core/model_card)

Ready to start building? [Get started](https://ai.google.dev/gemma/docs/get_started) with Gemma models\!

