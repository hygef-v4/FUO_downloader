let fileList = [];
let currentTitle = 'downloaded-files';

document.addEventListener('DOMContentLoaded', function () {
    const scanBtn = document.getElementById('scanBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const statusDiv = document.getElementById('status');
    const fileListDiv = document.getElementById('imageList');

    scanBtn.addEventListener('click', async function () {
        showStatus('Scanning for files...', 'info');
        scanBtn.disabled = true;
        downloadBtn.disabled = true;
        fileListDiv.style.display = 'none';
        fileListDiv.innerHTML = '';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Get page title and extract files
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractFilesAndTitle
            });

            const result = results[0].result;
            fileList = result.files; // Now contains objects {url, originalName}
            fileList.xfToken = result.xfToken; // Store token for later use
            fileList.requestUri = result.requestUri;

            // Sort files by "q" number (q1, q2, q3...) if present in the filename
            fileList.sort((a, b) => {
                const getQNumber = (fileObj) => {
                    try {
                        // Try to get Q number from original name first
                        let nameToCheck = fileObj.originalName || '';

                        // If no original name, try URL
                        if (!nameToCheck) {
                            const urlObj = new URL(fileObj.url);
                            const pathname = urlObj.pathname;
                            const parts = pathname.split('/');
                            nameToCheck = parts.pop() || parts.pop();
                        }

                        // Look for q followed by digits (e.g., q1, q23)
                        const qMatch = nameToCheck.match(/q(\d+)/i);
                        if (qMatch) {
                            return parseInt(qMatch[1], 10);
                        }
                    } catch (e) {
                        console.error('Error parsing for sorting:', e);
                    }
                    return Infinity; // Put non-matching items at the end
                };

                const qA = getQNumber(a);
                const qB = getQNumber(b);

                if (qA === Infinity && qB === Infinity) return 0;
                return qA - qB;
            });

            // Set title from page title
            if (result.title) {
                currentTitle = result.title;
            }

            if (fileList.length === 0) {
                showStatus('No files found in attachment list', 'error');
                downloadBtn.disabled = true;
            } else {
                showStatus(`Found ${fileList.length} file(s)`, 'success');
                downloadBtn.disabled = false;

                // Display file list
                fileListDiv.innerHTML = fileList.map((file, index) =>
                    `<div class="file-item">${index + 1}. ${getFileName(file, index)}</div>`
                ).join('');
                fileListDiv.style.display = 'block';
            }
        } catch (error) {
            showStatus('Error: ' + error.message, 'error');
        } finally {
            scanBtn.disabled = false;
        }
    });

    downloadBtn.addEventListener('click', async function () {
        let folderName = currentTitle.trim() || 'downloaded-files';

        // Sanitize filename again to be safe
        folderName = folderName.replace(/[<>:"\/\\|?*]/g, "").trim();
        if (!folderName) folderName = 'downloaded-files';

        if (fileList.length === 0) {
            showStatus('No files to download. Please scan first.', 'error');
            return;
        }

        downloadBtn.disabled = true;
        showStatus(`Preparing ZIP file with ${fileList.length} file(s)...`, 'info');

        try {
            // Check if JSZip is loaded
            if (typeof JSZip === 'undefined') {
                throw new Error('JSZip library not loaded. Please restart the extension.');
            }

            const zip = new JSZip();
            let successCount = 0;

            for (let i = 0; i < fileList.length; i++) {
                try {
                    const fileObj = fileList[i];
                    const filename = getFileName(fileObj, i);

                    showStatus(`Processing file ${i + 1}/${fileList.length}...`, 'info');

                    let blob;
                    if (fileObj.content) {
                        // Handle text content (already available)
                        blob = new Blob([fileObj.content], { type: 'text/plain;charset=utf-8' });
                    } else {
                        // Handle URL download
                        const response = await fetch(fileObj.url);
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        blob = await response.blob();

                        // --- Try to fetch comments if ID is present and not already fetched ---
                        if (fileObj.id && !fileObj.content) {
                            try {
                                // Construct API URL carefully using the parameters that allow access
                                // Base URL: https://fuoverflow.com/media/[id]/?...
                                // We need _xfToken which we extracted earlier

                                // Use the sidebar href if available as base, otherwise construct standard media URL
                                let baseUrl = fileObj.mediaUrl || `https://fuoverflow.com/media/${fileObj.id}/`;

                                // Construct query params
                                const params = new URLSearchParams();
                                params.append('lightbox', '1');
                                params.append('lightbox', 'true'); // cURL had both, mirroring it
                                params.append('_xfResponseType', 'json');
                                params.append('_xfWithData', '1');

                                if (fileList.xfToken) {
                                    params.append('_xfToken', fileList.xfToken);
                                }

                                // Add current page URI to likely satisfy validation
                                if (fileList.requestUri) {
                                    params.append('_xfRequestUri', fileList.requestUri);
                                }

                                const commentApiUrl = `${baseUrl}?${params.toString()}`;

                                const commentResp = await fetch(commentApiUrl);
                                if (commentResp.ok) {
                                    const data = await commentResp.json();
                                    if (data.html && data.html.content) {
                                        const commentText = parseComments(data.html.content, fileObj.id, fileObj.url);
                                        if (commentText) {
                                            // Create a text file for comments
                                            // Determine filename for text
                                            let textFilename = filename;
                                            const lastDot = textFilename.lastIndexOf('.');
                                            if (lastDot > 0) textFilename = textFilename.substring(0, lastDot);
                                            textFilename += '_comments.txt';

                                            // Add to zip
                                            zip.file(textFilename, new Blob([commentText], { type: 'text/plain;charset=utf-8' }));
                                        }
                                    }
                                }
                            } catch (err) {
                                console.log('No comments found or error for ID:', fileObj.id, err);
                            }
                        }
                    }

                    zip.file(filename, blob);
                    successCount++;
                } catch (error) {
                    console.error('Fetch error:', error);
                }
            }

            if (successCount === 0) {
                throw new Error('Failed to fetch any files for ZIP.');
            }

            showStatus('Generating ZIP file...', 'info');
            const content = await zip.generateAsync({
                type: "blob"
            });
            const zipUrl = URL.createObjectURL(content);

            // Use a subfolder to ensure filename is respected and avoid conflicts
            const zipFilename = `Fuo_Downloads/${folderName}.zip`;

            showStatus(`Saving as: ${zipFilename}...`, 'info');

            await chrome.downloads.download({
                url: zipUrl,
                filename: zipFilename,
                saveAs: false,
                conflictAction: 'uniquify'
            });

            showStatus(`✓ Successfully created ZIP with ${successCount} files`, 'success');

            // Clean up
            setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);

        } catch (error) {
            showStatus('Error creating ZIP: ' + error.message, 'error');
        } finally {
            downloadBtn.disabled = false;
        }
    });
});

// Helper: Parse comments from HTML string (Moved to global scope for Popup use)
function parseComments(htmlContent, mediaId, sourceUrl) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        // Check if we are blocked or no permission (often login form)
        if (doc.querySelector('form.login')) return null;

        const comments = doc.querySelectorAll('.comment, .message--comment');
        if (comments.length === 0) return null;

        let commentText = `Media ID: ${mediaId}\n`;
        if (sourceUrl) commentText += `Source: ${sourceUrl}\n`;
        commentText += `Extracted At: ${new Date().toLocaleString()}\n`;
        commentText += `Total Comments: ${comments.length}\n`;
        commentText += '================================================\n\n';

        comments.forEach((comment, index) => {
            const author = comment.dataset.author || 'Unknown';
            const contentId = comment.dataset.content || 'N/A';
            const timeEl = comment.querySelector('time');
            const time = timeEl ? (timeEl.getAttribute('title') || timeEl.textContent) : 'Unknown Time';

            // Extract text from bbWrapper
            const bbWrapper = comment.querySelector('.bbWrapper');
            const body = bbWrapper ? bbWrapper.innerText.trim() : '[No Content]';

            commentText += `#${index + 1} | User: ${author} | Date: ${time}\n`;
            commentText += `ID: ${contentId}\n`;
            commentText += `Content:\n${body}\n`;
            commentText += '------------------------------------------------\n';
        });

        return commentText;
    } catch (e) {
        console.error('Error parsing comments:', e);
        return null;
    }
}

// Function to extract files and title from the page
async function extractFilesAndTitle() {
    const files = [];
    const uniqueUrls = new Set();
    const isMediaPage = window.location.href.includes('/media/');

    // Helper: Parse comments from HTML string - We can't use the Global one directly in executeScript unless injected, 
    // so we keep a simple version here or rely on the fact parsing happens in Popup for threaded view.
    // However, for the 'Single Media Page' flow, we need it here.
    function parseCommentsLocal(htmlContent, mediaId) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const comments = doc.querySelectorAll('.comment, .message--comment');
        let commentText = `Media ID: ${mediaId}\n`;
        commentText += `Source: ${window.location.href}\n`;
        commentText += `Extracted At: ${new Date().toLocaleString()}\n`;
        commentText += `Total Comments: ${comments.length}\n`;
        commentText += '================================================\n\n';

        comments.forEach((comment, index) => {
            const author = comment.dataset.author || 'Unknown';
            const contentId = comment.dataset.content || 'N/A';
            const timeEl = comment.querySelector('time');
            const time = timeEl ? (timeEl.getAttribute('title') || timeEl.textContent) : 'Unknown Time';

            const bbWrapper = comment.querySelector('.bbWrapper');
            const body = bbWrapper ? bbWrapper.innerText.trim() : '[No Content]';

            commentText += `#${index + 1} | User: ${author} | Date: ${time}\n`;
            commentText += `ID: ${contentId}\n`;
            commentText += `Content:\n${body}\n`;
            commentText += '------------------------------------------------\n';
        });

        return commentText;
    }

    if (isMediaPage) {
        // --- Logic for Media Page (Image + Comments) ---
        try {
            // 1. Identify Media ID and Basic Info
            const urlParts = window.location.pathname.split('.');
            let mediaId = 'unknown';
            if (urlParts.length > 1) {
                const lastPart = urlParts[urlParts.length - 1].replace('/', '');
                if (/^\d+$/.test(lastPart)) {
                    mediaId = lastPart;
                }
            }

            // 2. Find the Main Image
            let imageUrl = '';
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) {
                imageUrl = ogImage.content;
            } else {
                const img = document.querySelector('.xfmgImage img, .media-container img');
                if (img) imageUrl = img.src;
            }

            if (imageUrl) {
                let title = document.title.split(' | ')[0].trim();
                files.push({
                    url: imageUrl,
                    id: mediaId,
                    originalName: `${title}_${mediaId}.jpg`
                });
            }

            // 3. Fetch Comments
            const apiUrl = window.location.href + (window.location.search ? '&' : '?') + '_xfResponseType=json&_xfWithData=1';

            try {
                const response = await fetch(apiUrl);
                const json = await response.json();

                if (json.html && json.html.content) {
                    const commentContent = parseCommentsLocal(json.html.content, mediaId);

                    files.push({
                        content: commentContent,
                        originalName: `${mediaId}_comments.txt`,
                        type: 'text'
                    });
                }
            } catch (err) {
                console.error('Error fetching comments:', err);
            }

        } catch (e) {
            console.error('Error in media extraction:', e);
        }
    }

    // --- Standard Logic (Mixed with Media Logic to catch attachments too) ---

    // Target specifically the attachment list
    const attachmentItems = document.querySelectorAll('.attachmentList .file--linked');

    if (attachmentItems.length > 0) {
        attachmentItems.forEach(li => {
            const link = li.querySelector('a[href*="/attachments/"]');
            if (!link) return;

            const href = link.href;
            if (uniqueUrls.has(href)) return;
            uniqueUrls.add(href);

            // Check if we already added this URL
            if (files.some(f => f.url === href)) return;

            // Try to get the real filename from the UI
            let name = '';
            const nameElement = li.querySelector('.file-name');
            if (nameElement) {
                name = nameElement.textContent.trim() || nameElement.getAttribute('title');
            }

            // Extract ID from URL for potential media lookup
            // Priority: data-lb-sidebar-href (Media ID) > href (Attachment ID)
            let extractedId = null;
            let mediaUrl = null;

            // Check for Media ID in data-lb-sidebar-href
            // Format: /media/name.35858/?lightbox=1
            const sidebarHref = link.getAttribute('data-lb-sidebar-href');
            if (sidebarHref) {
                // Get clean Media URL (absolute)
                let cleanHref = sidebarHref.split('?')[0];
                if (cleanHref.startsWith('/')) {
                    mediaUrl = window.location.origin + cleanHref;
                } else if (cleanHref.startsWith('http')) {
                    mediaUrl = cleanHref;
                }

                // Extract ID
                const mediaMatch = sidebarHref.match(/\/media\/.*?\.(\d+)(\/|\?|$)/);
                if (mediaMatch) {
                    extractedId = mediaMatch[1];
                }
            }

            // Fallback to Attachment ID if Media ID not found (though less useful for comments)
            if (!extractedId) {
                const match = href.match(/\.(\d+)\/?$/);
                if (match) {
                    extractedId = match[1];
                } else {
                    // Try alternate pattern /attachments/id/
                    const match2 = href.match(/\/attachments\/(\d+)\/?/);
                    if (match2) extractedId = match2[1];
                }
            }

            files.push({
                url: href,
                id: extractedId,
                mediaUrl: mediaUrl,
                originalName: name
            });
        });
    } else if (!isMediaPage) {
        // Fallback
        document.querySelectorAll('a[href*="/attachments/"]').forEach(a => {
            const href = a.href;
            if (!uniqueUrls.has(href)) {
                uniqueUrls.add(href);
                if (files.some(f => f.url === href)) return;

                let extractedId = null;
                const match = href.match(/\.(\d+)\/?$/);
                if (match) extractedId = match[1];

                files.push({
                    url: href,
                    id: extractedId,
                    originalName: ''
                });
            }
        });
    }

    // Extract page title
    let pageTitle = '';

    // Try to get title from h1.p-title-value (main thread title)
    const titleElement = document.querySelector('h1.p-title-value');
    if (titleElement) {
        // Remove label elements and get clean text
        const clonedTitle = titleElement.cloneNode(true);
        const labels = clonedTitle.querySelectorAll('.label');
        labels.forEach(label => label.remove());
        pageTitle = clonedTitle.textContent.trim();
    }

    // Fallback to document title if not found
    if (!pageTitle) {
        pageTitle = document.title.split(' | ')[0].trim();
    }

    // Clean up title for folder name
    pageTitle = pageTitle
        .replace(/[<>:"\/\\|?*]/g, '') // Remove invalid characters
        .trim()
        .substring(0, 100); // Limit length

    // Extract _xfToken
    let xfToken = '';
    const tokenInput = document.querySelector('input[name="_xfToken"]');
    if (tokenInput) {
        xfToken = tokenInput.value;
    } else {
        // Try global html attribute (XF2 style)
        xfToken = document.documentElement.getAttribute('data-csrf') || '';
    }

    return {
        files: files,
        title: pageTitle || 'downloaded-files',
        xfToken: xfToken,
        requestUri: window.location.pathname + window.location.search
    };
}

function getFileName(fileObj, index) {
    try {
        let filename = '';

        // Use original name if available
        if (fileObj.originalName) {
            filename = fileObj.originalName;
        } else if (fileObj.url) {
            // Fallback to URL parsing
            const urlObj = new URL(fileObj.url);
            let pathname = urlObj.pathname;
            const pathParts = pathname.split('/').filter(p => p);
            filename = pathParts[pathParts.length - 1];
            filename = filename.split('?')[0];

            if (/^\d+$/.test(filename) && pathParts.length > 1) {
                filename = pathParts[pathParts.length - 2];
            }
        } else {
            // Default based on type
            filename = `file_${String(index + 1).padStart(3, '0')}`;
            if (fileObj.type === 'text') filename += '.txt';
        }

        // Clean up filename but keep extension
        // Split extension
        const lastDotIndex = filename.lastIndexOf('.');
        let namePart = filename;
        let extension = '';

        if (lastDotIndex !== -1 && lastDotIndex > 0) {
            namePart = filename.substring(0, lastDotIndex);
            extension = filename.substring(lastDotIndex);
        } else {
            // Try to guess extension if missing
            if (filename.includes('-webp')) extension = '.webp';
            else if (filename.includes('-jpg')) extension = '.jpg';
            else if (filename.includes('-png')) extension = '.png';
            else if (fileObj.type === 'text') extension = '.txt';
            else extension = '.jpg'; // Default
        }

        // Clean name part
        namePart = namePart.replace(/[^a-zA-Z0-9_-]/g, '_');

        // Add index to ensure uniqueness and correct order
        // return `${String(index + 1).padStart(3, '0')}_${namePart}${extension}`;

        // If the original name was specifically set (like comments), preserve it nicely
        if (fileObj.originalName && fileObj.originalName.includes('_comments')) {
            return `${namePart}${extension}`;
        }

        return `${String(index + 1).padStart(3, '0')}_${namePart}${extension}`;
    } catch (error) {
        return `file_${String(index + 1).padStart(3, '0')}.dat`;
    }
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = type;
}