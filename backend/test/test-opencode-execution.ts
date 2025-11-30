import { spawn } from "child_process"
import path from "path"
import { streamJSONL } from "../src/lib/helpers/stream"
import { parseOpencodeStreamEvent } from "../src/lib/agent-architectures/opencode/block-converter"
import { logger } from "../src/config/logger"


// Variables
const scriptPath = path.join(import.meta.dirname, '..', 'sandbox', 'execute-opencode-query.ts')
const sessionId = 'ses_52f1258d7ffev7nAoAJy2cUTAC'
const prompt = 'Hello, how are you?'
const model = 'opencode/big-pickle'
const cwd = import.meta.dirname

const executeQuery = async () => {
    const child = spawn('tsx', [
        scriptPath,
        prompt,
        '--session-id', sessionId,
        '--model', model,
        '--cwd', cwd
    ])

    // Handle stderr
    child.stderr.on('data', (data) => {
        console.error('stderr:', data.toString())
    })

    // Convert Node.js stream to Web ReadableStream
    const stdout = new ReadableStream<string>({
        start(controller) {
            child.stdout.setEncoding('utf-8')
            child.stdout.on('data', (chunk: string) => {
                controller.enqueue(chunk)
            })
            child.stdout.on('end', () => {
                controller.close()
            })
            child.stdout.on('error', (err) => {
                controller.error(err)
            })
        }
    })

    // Stream JSONL messages and convert to StreamEvents
    let messageCount = 0

    for await (const opencodeEvent of streamJSONL<any>(stdout, 'opencode-sdk', logger)) {
        messageCount++

        // Convert SDK message to StreamEvents and yield each one
        const streamEvents = parseOpencodeStreamEvent(opencodeEvent, sessionId)
        for (const event of streamEvents) {
            console.log(event)
        }
    }

    console.log(`Processed ${messageCount} events`)

    // Wait for process to fully exit
    await new Promise<void>((resolve, reject) => {
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`Process exited with code ${code}`))
            }
        })
        child.on('error', reject)
    })
}




executeQuery()