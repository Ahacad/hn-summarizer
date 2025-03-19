/**
 * Extract the latest release notes from CHANGELOG.md
 * This script is used by the publish:github npm script
 */

const fs = require('fs');

// Read the changelog file
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

// Use regex to extract the latest release section
// This looks for a heading followed by a semantic version in brackets
// and captures everything until the next version heading or end of file
const versionMatch = changelog.match(/(#+\s\[[0-9]+\.[0-9]+\.[0-9]+\].*?(?=#+\s\[[0-9]+|$))/s);

// If we found a match, write it to the temporary file
if (versionMatch && versionMatch[0]) {
  const latestRelease = versionMatch[0];
  fs.writeFileSync('LATEST_RELEASE.md', latestRelease);
  console.log('Successfully extracted latest release notes.');
} else {
  // Fallback in case the regex doesn't match
  console.warn('Could not extract latest release notes. Using default message.');
  const version = require('../package.json').version;
  fs.writeFileSync('LATEST_RELEASE.md', `# v${version}\n\nRelease version ${version}`);
}
