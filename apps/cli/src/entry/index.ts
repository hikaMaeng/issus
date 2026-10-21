#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: issus <command> [options]\n\nP1 scaffold. Commands are provided by P7.');
} else {
  console.error('Unknown command. Use issus --help.');
  process.exitCode = 2;
}
