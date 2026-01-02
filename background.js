// Listen for download requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download') {
        chrome.downloads.download({
                url: request.url,
                filename: request.filename,
                conflictAction: 'uniquify',
                saveAs: false
            })
            .then(downloadId => {
                console.log('Download started:', downloadId);
                sendResponse({ success: true, downloadId: downloadId });
            })
            .catch(error => {
                console.error('Download failed:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep the message channel open for async response
    }
});

// Optional: Listen for download completion
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === 'complete') {
        console.log('Download completed:', delta.id);
    }
    if (delta.error) {
        console.error('Download error:', delta.error.current);
    }
});