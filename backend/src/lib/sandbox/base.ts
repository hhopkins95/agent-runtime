import { ChildProcess, exec } from "child_process";
import { Readable } from "stream";

export interface SandboxPrimitive { 

    getId : () => string,

    getBasePaths : () => {
        /**
         * The directory where the sandbox application files (executing sdk queries / file watcher scripts) are located
         */
        APP_DIR : string, 
        /**
         * The directory where the workspace files are located. Will contain the workspace files and the agent profile (.claude/ or .gemini/)
         */
        WORKSPACE_DIR : string, 
        /**
         * The root home dir where the agent app will store it's app data. (the .claude/ or .gemini/ dirs that have the session transcripts)
         */
        HOME_DIR : string,
    }

    exec : (command : string[]) => Promise<{stdout : ReadableStream, stderr : ReadableStream }>,

    readFile : (path : string) => Promise<string>,

    writeFile : (path : string, content : string) => Promise<void>,

    createDirectory : (path : string) => Promise<void>,

    listFiles : (path : string, pattern? : string) => Promise<string[]>,

    isRunning : () => Promise<boolean>,

    /**
     * Poll the sandbox to check if it's still running
     * @returns null if running, exit code (number) if exited
     */
    poll : () => Promise<number | null>,

    terminate : () => Promise<void>,

}