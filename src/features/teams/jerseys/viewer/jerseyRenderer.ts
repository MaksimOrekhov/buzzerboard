import { createJerseyModel } from './jerseyModel'
import type { JerseyPilot } from './jerseyPilots'
import { paintJerseyTexture } from './jerseyTextures'

const vertexSource = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform vec2 uYaw;
uniform vec2 uScale;
varying vec3 vNormal;
varying vec2 vUv;

vec3 turn(vec3 p) {
  vec3 yaw = vec3(p.x * uYaw.x + p.z * uYaw.y, p.y, p.z * uYaw.x - p.x * uYaw.y);
  return vec3(yaw.x, yaw.y * 0.996 - yaw.z * 0.09, yaw.z * 0.996 + yaw.y * 0.09);
}
void main() {
  vec3 view = turn(aPosition);
  gl_Position = vec4(view.xy * uScale, -view.z, 4.0 - view.z);
  vUv = aUv;
  vNormal = turn(aNormal);
}
`

const fragmentSource = `
precision mediump float;
uniform sampler2D uTexture;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vec3 light = normalize(vec3(-0.45, 0.65, 1.0));
  float diffuse = max(dot(normalize(vNormal), light), 0.0);
  float shade = gl_FrontFacing ? 0.55 + 0.45 * diffuse : 0.30;
  gl_FragColor = vec4(texture2D(uTexture, vUv).rgb * shade, 1.0);
}
`

export function createJerseyRenderer(canvas: HTMLCanvasElement, pilot: JerseyPilot) {
  const context = canvas.getContext('webgl', { alpha: true, powerPreference: 'low-power' })
  if (!context) return null
  const gl = context

  const shaders: WebGLShader[] = []
  const buffers: WebGLBuffer[] = []
  const textures: WebGLTexture[] = []
  const program = gl.createProgram()
  if (!program) return null

  function dispose() {
    gl.deleteProgram(program)
    for (const shader of shaders) gl.deleteShader(shader)
    for (const buffer of buffers) gl.deleteBuffer(buffer)
    for (const texture of textures) gl.deleteTexture(texture)
  }

  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, fragmentSource],
    ] as const) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Jersey shader allocation failed')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'Jersey shader compilation failed')
      }
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Jersey shader link failed')
    }

    gl.useProgram(program)
    gl.enable(gl.DEPTH_TEST)
    gl.clearColor(0, 0, 0, 0)
    const position = gl.getAttribLocation(program, 'aPosition')
    const normal = gl.getAttribLocation(program, 'aNormal')
    const uv = gl.getAttribLocation(program, 'aUv')
    const yaw = gl.getUniformLocation(program, 'uYaw')
    const scale = gl.getUniformLocation(program, 'uScale')
    const attributes = [
      { location: position, size: 3, offset: 0 },
      { location: normal, size: 3, offset: 12 },
      { location: uv, size: 2, offset: 24 },
    ]
    for (const { location } of attributes) gl.enableVertexAttribArray(location)

    const textureCanvas = document.createElement('canvas')
    const model = createJerseyModel()
    const meshes = (['front', 'back'] as const).map((side) => {
      const { vertices, indices } = model[side]
      const vertexBuffer = gl.createBuffer()
      if (!vertexBuffer) throw new Error('Jersey vertex buffer allocation failed')
      buffers.push(vertexBuffer)
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)

      const indexBuffer = gl.createBuffer()
      if (!indexBuffer) throw new Error('Jersey index buffer allocation failed')
      buffers.push(indexBuffer)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

      const texture = gl.createTexture()
      if (!texture) throw new Error('Jersey texture allocation failed')
      textures.push(texture)
      if (!paintJerseyTexture(textureCanvas, pilot, side)) {
        throw new Error('Jersey texture painting failed')
      }
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas)

      return { vertexBuffer, indexBuffer, texture, count: indices.length }
    })
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Jersey renderer setup failed')

    return {
      draw(angle: number, zoom: number) {
        const { clientWidth, clientHeight } = canvas
        if (!clientWidth || !clientHeight) return
        const density = Math.min(window.devicePixelRatio || 1, 2)
        const width = Math.round(clientWidth * density)
        const height = Math.round(clientHeight * density)
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }

        const aspect = width / height
        const size = 2.53 * zoom * Math.min(1, aspect / 0.72)
        gl.viewport(0, 0, width, height)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.uniform2f(yaw, Math.cos(angle), Math.sin(angle))
        gl.uniform2f(scale, size / aspect, size)
        for (const { vertexBuffer, indexBuffer, texture, count } of meshes) {
          gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
          for (const { location, size, offset } of attributes) {
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset)
          }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
          gl.bindTexture(gl.TEXTURE_2D, texture)
          gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0)
        }
      },
      dispose,
    }
  } catch {
    dispose()
    return null
  }
}
