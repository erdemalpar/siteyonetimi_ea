window.addEventListener('error', function(event) {
    require('fs').appendFileSync('frontend_error.log', event.message + '\n' + event.filename + ':' + event.lineno + '\n');
});
window.addEventListener('unhandledrejection', function(event) {
    require('fs').appendFileSync('frontend_error.log', 'Unhandled promise rejection: ' + event.reason + '\n');
});
