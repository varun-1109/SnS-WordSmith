// IMPORTANT: Replace with your actual Gemini API key.
// Ensure this API key has no HTTP referrer restrictions for GitHub Pages,
// or add "https://varun-1109.github.io/*" as an allowed HTTP referrer in Google Cloud Console.
const GEMINI_API_KEY = "AIzaSyBbxlaWwMjDJSkUzhhSXLs2aUR4Rr6XGDQ";

// --- NEW: Pixabay API Key (Replace with your actual key from Pixabay!) ---
const PIXABAY_API_KEY = "51329430-f7cd0022fd4c0720917ac9423"; // <--- GET THIS FROM PIXABAY.COM/API/DOCS
// --- END NEW ---

// Get references to HTML elements
const wordInput = document.getElementById('wordInput');
const searchButton = document.getElementById('searchButton');
const messageDisplay = document.getElementById('messageDisplay');
const definitionOutput = document.getElementById('definitionOutput');
const imageDisplay = document.getElementById('imageDisplay'); // Reference to the image display div


/**
 * Displays a message to the user.
 * @param {string} message - The message text.
 * @param {'info'|'error'|'success'} type - The type of message (for styling).
 */
function showMessage(message, type) {
    messageDisplay.textContent = message;
    messageDisplay.className = `message ${type}`; // Apply base and type-specific classes
    messageDisplay.classList.remove('hidden'); // Make sure it's visible
}

/**
 * Clears any displayed messages.
 */
function clearMessage() {
    messageDisplay.classList.add('hidden'); // Hide the message div
    messageDisplay.textContent = ''; // Clear text content
}

/**
 * Searches for the English word definition using the Gemini API.
 */
async function searchWord() {
    const word = wordInput.value.trim(); // Get word and remove whitespace

    if (!word) {
        showMessage('Please enter an English word.', 'error');
        definitionOutput.innerHTML = '<div id="imageDisplay"></div>'; // Clear previous definition and keep image div
        imageDisplay.innerHTML = ''; // Clear image
        return;
    }

    clearMessage();
    showMessage('Searching for definition and image...', 'info');
    definitionOutput.innerHTML = '<div id="imageDisplay"></div>'; // Clear previous definition and keep image div
    imageDisplay.innerHTML = ''; // Clear image


    // --- NEW: Fetch image concurrently with translation ---
    let imageUrl = null;
    try {
        imageUrl = await fetchClipartImage(word);
         console.log('1. Image URL returned by fetchClipartImage:', imageUrl); // ADD THIS LINE
    } catch (imageError) {
        console.warn("Could not fetch image for word:", word, imageError);
        // Don't block translation if image fails
    }
    // --- END NEW ---

    let chatHistory = [];
    // Prompt the LLM to get the definition in the desired structured JSON format
    const prompt = `Provide the Hindi meaning, English meaning, and a simple example sentence for the English word '${word}' in JSON format.
    The JSON should have the following keys:
    "word": (the English word you provided)
    "hindiMeaning": (Hindi translation of the word)
    "englishMeaning": (English definition of the word)
    "exampleSentence": (a simple sentence using the word)
    Ensure the example sentence is easy to understand for a student learning English.`;

    chatHistory.push({ role: "user", parts: [{ text: prompt }] });

    // Define the expected JSON schema for the LLM response
    const payload = {
        contents: chatHistory,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "word": { "type": "STRING" },
                    "hindiMeaning": { "type": "STRING" },
                    "englishMeaning": { "type": "STRING" },
                    "exampleSentence": { "type": "STRING" }
                },
                // Ensure the order of properties in the response
                "propertyOrdering": ["word", "hindiMeaning", "englishMeaning", "exampleSentence"]
            }
        }
    };

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }

        const result = await response.json();

        // Check if the response structure is as expected
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {

            const jsonString = result.candidates[0].content.parts[0].text;
            const definitionData = JSON.parse(jsonString);

            // Validate that all required fields are present in the parsed JSON
            if (definitionData.word && definitionData.hindiMeaning &&
                definitionData.englishMeaning && definitionData.exampleSentence) {
                displayDefinition(definitionData, imageUrl); // Pass imageUrl to display function
                showMessage('Definition and image found!', 'success');
            } else {
                throw new Error('Received incomplete or malformed data from the LLM.');
            }
        } else {
            throw new Error('No valid content found in the LLM response.');
        }

    } catch (error) {
        console.error('Error fetching definition:', error);
        showMessage(`Could not find a definition or an error occurred: ${error.message}. Please try again or a different word.`, 'error');
    }
}


// --- NEW ASYNC FUNCTION TO FETCH IMAGE FROM PIXABAY ---
async function fetchClipartImage(query) {
    if (!PIXABAY_API_KEY || PIXABAY_API_KEY === "YOUR_PIXABAY_API_KEY_HERE") {
        console.error("Pixabay API key is not set. Please get one from pixabay.com/api/docs/");
        return null;
    }

    // Construct Pixabay API URL
    // search for "vectors" (clipart), order by popular, safe search, and short_url for direct image link
    const pixabayUrl = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&image_type=vector&orientation=horizontal&safesearch=true&per_page=3&pretty=true`;

    try {
        const response = await fetch(pixabayUrl);
        if (!response.ok) {
            throw new Error(`Pixabay API request failed with status ${response.status}`);
        }
        const data = await response.json();
        console.log('2. Pixabay API raw response for query:', query, data); // ADD THIS LINE

        if (data.hits && data.hits.length > 0) {
            // Pick the first result's large image URL or webformatURL
            return data.hits[0].webformatURL; // webformatURL is often a good size for display
        } else {
            console.log(`No clipart found on Pixabay for "${query}"`);
            return null;
        }
    } catch (error) {
        console.error("Error fetching clipart from Pixabay:", error);
        return null;
    }
}
// --- END NEW ASYNC FUNCTION ---


/**
 * Displays the word definition in a table format and includes a pictorial representation.
 * @param {object} data - The definition data (word, hindiMeaning, englishMeaning, exampleSentence).
 * @param {string|null} imageUrl - The URL of the image to display, or null if none.
 */
function displayDefinition(data, imageUrl) {
    // Clear previous content in imageDisplay before adding new image
    imageDisplay.innerHTML = '';
    if (imageUrl) {
        imageDisplay.innerHTML = `<img src="${imageUrl}" alt="${data.word} clipart">`;
    }

    // Display the definition table in definitionOutput (which already contains imageDisplay div)
    definitionOutput.innerHTML += `
        <table class="min-w-full">
            <thead>
                <tr>
                    <th>Word</th>
                    <th>Hindi Meaning</th>
                    <th>English Meaning</th>
                    <th>Example Sentence</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>${data.word}</td>
                    <td>${data.hindiMeaning}</td>
                    <td>${data.englishMeaning}</td>
                    <td>${data.exampleSentence}</td>
                </tr>
            </tbody>
        </table>
    `;
}

// Add event listener to the search button
searchButton.addEventListener('click', searchWord);

// Allow searching by pressing Enter in the input field
wordInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        searchWord();
    }
});

// Initial message to guide the user
window.onload = () => {
    showMessage('Type an English word and click "Search Word" to get its definition and a picture.', 'info');
};
