import { AgentProfile } from "../../types/agent-profiles"
import { AGENT_ARCHITECTURE_TYPE } from "../../types/session/index"
import { SandboxPrimitive } from "./base"
import { ModalSandbox } from "./modal"
import { ModalContext } from "./modal/client"

type SandboxProviders = "modal"


export const createSandbox = async (args : { 
    provider : SandboxProviders, 
    agentProfile : AgentProfile,
    modalContext : ModalContext, 
    agentArchitecture : AGENT_ARCHITECTURE_TYPE
}) : Promise<SandboxPrimitive> => { 
    return await ModalSandbox.create(args.agentProfile, args.modalContext, args.agentArchitecture);
}
