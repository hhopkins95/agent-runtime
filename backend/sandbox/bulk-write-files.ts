#!/usr/bin/env tsx
/**
 * Bulk File Writer - Runs inside Modal sandbox
 *
 * This script receives a base64-encoded JSON payload as an argument
 * containing files to write, and writes them all in a single operation.
 *
 * Usage:
 *   tsx bulk-write-files.ts <base64-encoded-json>
 *
 * Input (base64 decoded):
 *   { "files": [{ "path": "/absolute/path", "content": "file content" }, ...] }
 *
 * Output (stdout):
 *   { "success": [{ "path": "/path1" }], "failed": [{ "path": "/path2", "error": "message" }] }
 *
 * Features:
 *   - Creates parent directories as needed (mkdir -p equivalent)
 *   - Partial success - writes what it can, reports failures
 *   - Base64 encoding avoids shell escaping issues with large payloads
 */

import * as fs from 'fs';
import * as path from 'path';

interface FileToWrite {
    path: string;
    content: string;
}

interface Input {
    files: FileToWrite[];
}

interface Output {
    success: { path: string }[];
    failed: { path: string; error: string }[];
}

function ensureDirectory(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function main(): void {
    const output: Output = {
        success: [],
        failed: []
    };

    try {
        const base64Input = process.argv[2];
        if (!base64Input) {
            throw new Error('Missing base64-encoded input argument');
        }

        const inputJson = Buffer.from(base64Input, 'base64').toString('utf-8');
        const input: Input = JSON.parse(inputJson);

        if (!input.files || !Array.isArray(input.files)) {
            throw new Error('Invalid input: expected { files: [...] }');
        }

        for (const file of input.files) {
            try {
                ensureDirectory(file.path);
                fs.writeFileSync(file.path, file.content, 'utf-8');
                output.success.push({ path: file.path });
            } catch (err) {
                output.failed.push({
                    path: file.path,
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        }
    } catch (err) {
        // If we can't even parse input, report a single failure
        output.failed.push({
            path: '<input>',
            error: err instanceof Error ? err.message : String(err)
        });
    }

    console.log(JSON.stringify(output));
}

try {
    main();
} catch (err) {
    console.log(JSON.stringify({
        success: [],
        failed: [{ path: '<fatal>', error: err instanceof Error ? err.message : String(err) }]
    }));
    process.exit(1);
}
