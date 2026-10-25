import { handleRequest, type Env } from './handler.ts'

const worker = {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env)
  },
}

export default worker
