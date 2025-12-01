import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url";

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


dotenv.config({
    path: path.join(__dirname, "../.env"),
})



async function main() {

    const ModalSandbox = await import("../src/lib/sandbox/modal").then(m => m.ModalSandbox);
    const initializeModal = await import("../src/lib/sandbox/modal/client").then(m => m.initializeModal);


    const modalContext = await initializeModal({
        tokenId: process.env.MODAL_TOKEN_ID!,
        tokenSecret: process.env.MODAL_TOKEN_SECRET!,
        appName: "test"
    });


    const sandbox = await ModalSandbox.create({
        id: "test",
        name: 'test',
    }, modalContext,
        'opencode'
    );

    console.log(sandbox.getId())

    const result = await sandbox.writeFiles([
        {
            path: "/workspace/test.txt",
            content: "Hello, world!"
        },
        {
            path: "/workspace/test2.txt",
            content: "Hello, world 2!"
        },

    ]);

    console.log(result);

}


main()