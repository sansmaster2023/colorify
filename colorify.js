(function (Scratch) {
    const fragShader = "precision mediump float;\n\nuniform float u_tintR;\nuniform float u_tintG;\nuniform float u_tintB;\n\n#ifdef DRAW_MODE_silhouette\nuniform vec4 u_silhouetteColor;\n#else // DRAW_MODE_silhouette\n# ifdef ENABLE_color\nuniform float u_color;\n# endif // ENABLE_color\n# ifdef ENABLE_brightness\nuniform float u_brightness;\n# endif // ENABLE_brightness\n#endif // DRAW_MODE_silhouette\n\n#ifdef DRAW_MODE_colorMask\nuniform vec3 u_colorMask;\nuniform float u_colorMaskTolerance;\n#endif // DRAW_MODE_colorMask\n\n#ifdef ENABLE_fisheye\nuniform float u_fisheye;\n#endif // ENABLE_fisheye\n#ifdef ENABLE_whirl\nuniform float u_whirl;\n#endif // ENABLE_whirl\n#ifdef ENABLE_pixelate\nuniform float u_pixelate;\nuniform vec2 u_skinSize;\n#endif // ENABLE_pixelate\n#ifdef ENABLE_mosaic\nuniform float u_mosaic;\n#endif // ENABLE_mosaic\n#ifdef ENABLE_ghost\nuniform float u_ghost;\n#endif // ENABLE_ghost\n\n#ifdef DRAW_MODE_line\nvarying vec4 v_lineColor;\nvarying float v_lineThickness;\nvarying float v_lineLength;\n#endif // DRAW_MODE_line\n\n#ifdef DRAW_MODE_background\nuniform vec4 u_backgroundColor;\n#endif // DRAW_MODE_background\n\nuniform sampler2D u_skin;\n\n#ifndef DRAW_MODE_background\nvarying vec2 v_texCoord;\n#endif\n\n// Add this to divisors to prevent division by 0, which results in NaNs propagating through calculations.\n// Smaller values can cause problems on some mobile devices.\nconst float epsilon = 1e-3;\n\n#if !defined(DRAW_MODE_silhouette) && (defined(ENABLE_color))\n// Branchless color conversions based on code from:\n// http://www.chilliant.com/rgb2hsv.html by Ian Taylor\n// Based in part on work by Sam Hocevar and Emil Persson\n// See also: https://en.wikipedia.org/wiki/HSL_and_HSV#Formal_derivation\n\n\n// Convert an RGB color to Hue, Saturation, and Value.\n// All components of input and output are expected to be in the [0,1] range.\nvec3 convertRGB2HSV(vec3 rgb)\n{\n\t// Hue calculation has 3 cases, depending on which RGB component is largest, and one of those cases involves a \"mod\"\n\t// operation. In order to avoid that \"mod\" we split the M==R case in two: one for G<B and one for B>G. The B>G case\n\t// will be calculated in the negative and fed through abs() in the hue calculation at the end.\n\t// See also: https://en.wikipedia.org/wiki/HSL_and_HSV#Hue_and_chroma\n\tconst vec4 hueOffsets = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);\n\n\t// temp1.xy = sort B & G (largest first)\n\t// temp1.z = the hue offset we'll use if it turns out that R is the largest component (M==R)\n\t// temp1.w = the hue offset we'll use if it turns out that R is not the largest component (M==G or M==B)\n\tvec4 temp1 = rgb.b > rgb.g ? vec4(rgb.bg, hueOffsets.wz) : vec4(rgb.gb, hueOffsets.xy);\n\n\t// temp2.x = the largest component of RGB (\"M\" / \"Max\")\n\t// temp2.yw = the smaller components of RGB, ordered for the hue calculation (not necessarily sorted by magnitude!)\n\t// temp2.z = the hue offset we'll use in the hue calculation\n\tvec4 temp2 = rgb.r > temp1.x ? vec4(rgb.r, temp1.yzx) : vec4(temp1.xyw, rgb.r);\n\n\t// m = the smallest component of RGB (\"min\")\n\tfloat m = min(temp2.y, temp2.w);\n\n\t// Chroma = M - m\n\tfloat C = temp2.x - m;\n\n\t// Value = M\n\tfloat V = temp2.x;\n\n\treturn vec3(\n\t\tabs(temp2.z + (temp2.w - temp2.y) / (6.0 * C + epsilon)), // Hue\n\t\tC / (temp2.x + epsilon), // Saturation\n\t\tV); // Value\n}\n\nvec3 convertHue2RGB(float hue)\n{\n\tfloat r = abs(hue * 6.0 - 3.0) - 1.0;\n\tfloat g = 2.0 - abs(hue * 6.0 - 2.0);\n\tfloat b = 2.0 - abs(hue * 6.0 - 4.0);\n\treturn clamp(vec3(r, g, b), 0.0, 1.0);\n}\n\nvec3 convertHSV2RGB(vec3 hsv)\n{\n\tvec3 rgb = convertHue2RGB(hsv.x);\n\tfloat c = hsv.z * hsv.y;\n\treturn rgb * c + hsv.z - c;\n}\n#endif // !defined(DRAW_MODE_silhouette) && (defined(ENABLE_color))\n\nconst vec2 kCenter = vec2(0.5, 0.5);\n\nvoid main()\n{\n\t#if !(defined(DRAW_MODE_line) || defined(DRAW_MODE_background))\n\tvec2 texcoord0 = v_texCoord;\n\n\t#ifdef ENABLE_mosaic\n\ttexcoord0 = fract(u_mosaic * texcoord0);\n\t#endif // ENABLE_mosaic\n\n\t#ifdef ENABLE_pixelate\n\t{\n\t\t// TODO: clean up \"pixel\" edges\n\t\tvec2 pixelTexelSize = u_skinSize / u_pixelate;\n\t\ttexcoord0 = (floor(texcoord0 * pixelTexelSize) + kCenter) / pixelTexelSize;\n\t}\n\t#endif // ENABLE_pixelate\n\n\t#ifdef ENABLE_whirl\n\t{\n\t\tconst float kRadius = 0.5;\n\t\tvec2 offset = texcoord0 - kCenter;\n\t\tfloat offsetMagnitude = length(offset);\n\t\tfloat whirlFactor = max(1.0 - (offsetMagnitude / kRadius), 0.0);\n\t\tfloat whirlActual = u_whirl * whirlFactor * whirlFactor;\n\t\tfloat sinWhirl = sin(whirlActual);\n\t\tfloat cosWhirl = cos(whirlActual);\n\t\tmat2 rotationMatrix = mat2(\n\t\t\tcosWhirl, -sinWhirl,\n\t\t\tsinWhirl, cosWhirl\n\t\t);\n\n\t\ttexcoord0 = rotationMatrix * offset + kCenter;\n\t}\n\t#endif // ENABLE_whirl\n\n\t#ifdef ENABLE_fisheye\n\t{\n\t\tvec2 vec = (texcoord0 - kCenter) / kCenter;\n\t\tfloat vecLength = length(vec);\n\t\tfloat r = pow(min(vecLength, 1.0), u_fisheye) * max(1.0, vecLength);\n\t\tvec2 unit = vec / vecLength;\n\n\t\ttexcoord0 = kCenter + r * unit * kCenter;\n\t}\n\t#endif // ENABLE_fisheye\n\n\tgl_FragColor = texture2D(u_skin, texcoord0);\n\n\t#if defined(ENABLE_color) || defined(ENABLE_brightness)\n\t// Divide premultiplied alpha values for proper color processing\n\t// Add epsilon to avoid dividing by 0 for fully transparent pixels\n\tgl_FragColor.rgb = clamp(gl_FragColor.rgb / (gl_FragColor.a + epsilon), 0.0, 1.0);\n\n\t#ifdef ENABLE_color\n\t{\n\t\tvec3 hsv = convertRGB2HSV(gl_FragColor.xyz);\n\n\t\t// this code forces grayscale values to be slightly saturated\n\t\t// so that some slight change of hue will be visible\n\t\tconst float minLightness = 0.0;\n\t\tconst float minSaturation = 0.0;\n\t\tif (hsv.z < minLightness) hsv = vec3(0.0, 1.0, minLightness);\n\t\telse if (hsv.y < minSaturation) hsv = vec3(0.0, minSaturation, hsv.z);\n\n\t\thsv.x = mod(hsv.x + u_color, 1.0);\n\t\tif (hsv.x < 0.0) hsv.x += 1.0;\n\n\t\tgl_FragColor.rgb = convertHSV2RGB(hsv);\n\t}\n\t#endif // ENABLE_color\n\n\t#ifdef ENABLE_brightness\n\tgl_FragColor.rgb = clamp(gl_FragColor.rgb + vec3(u_brightness), vec3(0), vec3(1));\n\t#endif // ENABLE_brightness\n\n\t// Re-multiply color values\n\tgl_FragColor.rgb *= gl_FragColor.a + epsilon;\n\n\t#endif // defined(ENABLE_color) || defined(ENABLE_brightness)\n\n\t#ifdef ENABLE_ghost\n\tgl_FragColor *= u_ghost;\n\t#endif // ENABLE_ghost\n\n\t#ifdef DRAW_MODE_silhouette\n\t// Discard fully transparent pixels for stencil test\n\tif (gl_FragColor.a == 0.0) {\n\t\tdiscard;\n\t}\n\t// switch to u_silhouetteColor only AFTER the alpha test\n\tgl_FragColor = u_silhouetteColor;\n\t#else // DRAW_MODE_silhouette\n\n\t#ifdef DRAW_MODE_colorMask\n\tvec3 maskDistance = abs(gl_FragColor.rgb - u_colorMask);\n\tvec3 colorMaskTolerance = vec3(u_colorMaskTolerance, u_colorMaskTolerance, u_colorMaskTolerance);\n\tif (any(greaterThan(maskDistance, colorMaskTolerance)))\n\t{\n\t\tdiscard;\n\t}\n\t#endif // DRAW_MODE_colorMask\n\t#endif // DRAW_MODE_silhouette\n\n\t#ifdef DRAW_MODE_straightAlpha\n\t// Un-premultiply alpha.\n\tgl_FragColor.rgb /= gl_FragColor.a + epsilon;\n\t#endif\n\n\t#endif // !(defined(DRAW_MODE_line) || defined(DRAW_MODE_background))\n\n\t#ifdef DRAW_MODE_line\n\t// Maaaaagic antialiased-line-with-round-caps shader.\n\n\t// \"along-the-lineness\". This increases parallel to the line.\n\t// It goes from negative before the start point, to 0.5 through the start to the end, then ramps up again\n\t// past the end point.\n\tfloat d = ((v_texCoord.x - clamp(v_texCoord.x, 0.0, v_lineLength)) * 0.5) + 0.5;\n\n\t// Distance from (0.5, 0.5) to (d, the perpendicular coordinate). When we're in the middle of the line,\n\t// d will be 0.5, so the distance will be 0 at points close to the line and will grow at points further from it.\n\t// For the \"caps\", d will ramp down/up, giving us rounding.\n\t// See https://www.youtube.com/watch?v=PMltMdi1Wzg for a rough outline of the technique used to round the lines.\n\tfloat line = distance(vec2(0.5), vec2(d, v_texCoord.y)) * 2.0;\n\t// Expand out the line by its thickness.\n\tline -= ((v_lineThickness - 1.0) * 0.5);\n\t// Because \"distance to the center of the line\" decreases the closer we get to the line, but we want more opacity\n\t// the closer we are to the line, invert it.\n\tgl_FragColor = v_lineColor * clamp(1.0 - line, 0.0, 1.0);\n\t#endif // DRAW_MODE_line\n\n\t#ifdef DRAW_MODE_background\n\tgl_FragColor = u_backgroundColor;\n\t#endif\n\n\tgl_FragColor.rgb *= vec3(u_tintR, u_tintG, u_tintB);\n}\n";
    const vsShader = "precision mediump float;\n\n#ifdef DRAW_MODE_line\nuniform vec2 u_stageSize;\nattribute vec2 a_lineThicknessAndLength;\nattribute vec4 a_penPoints;\nattribute vec4 a_lineColor;\n\nvarying vec4 v_lineColor;\nvarying float v_lineThickness;\nvarying float v_lineLength;\nvarying vec4 v_penPoints;\n\n// Add this to divisors to prevent division by 0, which results in NaNs propagating through calculations.\n// Smaller values can cause problems on some mobile devices.\nconst float epsilon = 1e-3;\n#endif\n\n#if !(defined(DRAW_MODE_line) || defined(DRAW_MODE_background))\nuniform mat4 u_projectionMatrix;\nuniform mat4 u_modelMatrix;\nattribute vec2 a_texCoord;\n#endif\n\nattribute vec2 a_position;\n\nvarying vec2 v_texCoord;\n\nvoid main() {\n\t#ifdef DRAW_MODE_line\n\t// Calculate a rotated (\"tight\") bounding box around the two pen points.\n\t// Yes, we're doing this 6 times (once per vertex), but on actual GPU hardware,\n\t// it's still faster than doing it in JS combined with the cost of uniformMatrix4fv.\n\n\t// Expand line bounds by sqrt(2) / 2 each side-- this ensures that all antialiased pixels\n\t// fall within the quad, even at a 45-degree diagonal\n\tvec2 position = a_position;\n\tfloat expandedRadius = (a_lineThicknessAndLength.x * 0.5) + 1.4142135623730951;\n\n\t// The X coordinate increases along the length of the line. It's 0 at the center of the origin point\n\t// and is in pixel-space (so at n pixels along the line, its value is n).\n\tv_texCoord.x = mix(0.0, a_lineThicknessAndLength.y + (expandedRadius * 2.0), a_position.x) - expandedRadius;\n\t// The Y coordinate is perpendicular to the line. It's also in pixel-space.\n\tv_texCoord.y = ((a_position.y - 0.5) * expandedRadius) + 0.5;\n\n\tposition.x *= a_lineThicknessAndLength.y + (2.0 * expandedRadius);\n\tposition.y *= 2.0 * expandedRadius;\n\n\t// 1. Center around first pen point\n\tposition -= expandedRadius;\n\n\t// 2. Rotate quad to line angle\n\tvec2 pointDiff = a_penPoints.zw;\n\t// Ensure line has a nonzero length so it's rendered properly\n\t// As long as either component is nonzero, the line length will be nonzero\n\t// If the line is zero-length, give it a bit of horizontal length\n\tpointDiff.x = (abs(pointDiff.x) < epsilon && abs(pointDiff.y) < epsilon) ? epsilon : pointDiff.x;\n\t// The `normalized` vector holds rotational values equivalent to sine/cosine\n\t// We're applying the standard rotation matrix formula to the position to rotate the quad to the line angle\n\t// pointDiff can hold large values so we must divide by u_lineLength instead of calling GLSL's normalize function:\n\t// https://asawicki.info/news_1596_watch_out_for_reduced_precision_normalizelength_in_opengl_es\n\tvec2 normalized = pointDiff / max(a_lineThicknessAndLength.y, epsilon);\n\tposition = mat2(normalized.x, normalized.y, -normalized.y, normalized.x) * position;\n\n\t// 3. Translate quad\n\tposition += a_penPoints.xy;\n\n\t// 4. Apply view transform\n\tposition *= 2.0 / u_stageSize;\n\tgl_Position = vec4(position, 0, 1);\n\n\tv_lineColor = a_lineColor;\n\tv_lineThickness = a_lineThicknessAndLength.x;\n\tv_lineLength = a_lineThicknessAndLength.y;\n\tv_penPoints = a_penPoints;\n\t#elif defined(DRAW_MODE_background)\n\tgl_Position = vec4(a_position * 2.0, 0, 1);\n\t#else\n\tgl_Position = u_projectionMatrix * u_modelMatrix * vec4(a_position, 0, 1);\n\tv_texCoord = a_texCoord;\n\t#endif\n}\n";
    if (!Scratch.extensions.unsandboxed) {
        throw new Error("Colorify must be run unsandboxed");
    }
    const vm = Scratch.vm;
    vm.exports.RenderedTarget.prototype.tintR = 255;
    vm.exports.RenderedTarget.prototype.tintG = 255;
    vm.exports.RenderedTarget.prototype.tintB = 255;
    const runtime = vm.runtime;
    const renderer = runtime.renderer;
    const gl = renderer._gl;
    const twgl = renderer.exports.twgl;
    var pro = Object.getPrototypeOf(renderer._shaderManager);
    pro.constructor.EFFECT_INFO.u_tintR = {
        uniformName: 'u_tintR',
        mask: 1 << 7,
        converter: x => 1,
        shapeChanges: false
    } 
    pro.constructor.EFFECT_INFO.u_tintG = {
        uniformName: 'u_tintG',
        mask: 1 << 7,
        converter: x => 1,
        shapeChanges: false
    } 
    pro.constructor.EFFECT_INFO.u_tintB = {
        uniformName: 'u_tintB',
        mask: 1 << 7,
        converter: x => 1,
        shapeChanges: false
    }
    pro.constructor.EFFECTS.push("u_tintR");
    pro.constructor.EFFECTS.push("u_tintG"); 
    pro.constructor.EFFECTS.push("u_tintB"); 

    renderer._allDrawables.forEach(element => {
        element._uniforms.u_tintR = 1;
        element._uniforms.u_tintG = 1;
        element._uniforms.u_tintB = 1;
        
    });
    pro._buildShader = function(drawMode, effectBits) {
        const numEffects = 7;

        const defines = [
            `#define DRAW_MODE_${drawMode}`
        ];
        for (let index = 0; index < numEffects; ++index) {
            if ((effectBits & (1 << index)) !== 0) {
                defines.push(`#define ENABLE_${pro.constructor.EFFECTS[index]}`);
            }
        }

        const definesText = `${defines.join('\n')}\n`;

        /* eslint-disable global-require */
        const vsFullText = definesText + vsShader;
        const fsFullText = definesText + fragShader;
        /* eslint-enable global-require */

        return twgl.createProgramInfo(gl, [vsFullText, fsFullText]);
    }
    renderer._shaderManager._shaderCache = {};
    var DRAW_MODE = {
        /**
         * Draw normally. Its output will use premultiplied alpha.
         */
        default: 'default',
    
        /**
         * Draw with non-premultiplied alpha. Useful for reading pixels from GL into an ImageData object.
         */
        straightAlpha: 'straightAlpha',
    
        /**
         * Draw a silhouette using a solid color.
         */
        silhouette: 'silhouette',
    
        /**
         * Draw only the parts of the drawable which match a particular color.
         */
        colorMask: 'colorMask',
    
        /**
         * Draw a line with caps.
         */
        line: 'line',
    
        /**
         * Draw the background in a certain color. Must sometimes be used instead of gl.clear.
         */
        background: 'background'
    };
    for (const modeName in DRAW_MODE) {
        renderer._shaderManager._shaderCache[modeName] = [];
    }
    class Colorify {
        constructor () {
            
        }
        getInfo() {
            
            return {
            id: 'colorify1',
            name: 'Colorify',
            blocks: [
                {
                    opcode: 'tint',
                    blockType: Scratch.BlockType.COMMAND,
                    text: 'Tint [R][G][B]',
                    arguments: {
                        R: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 255
                        },
                        G: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 255
                        },
                        B: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 255
                        }
                    }
                },
                {
                    opcode: 'getImageResolution',
                    blockType: Scratch.BlockType.REPORTER,
                    text: 'getImageResolution [URI]',
                    arguments: {
                        URI: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "sans"
                        }
                    }
                },
            ]
            };
        }
        tint(args, util) {
            var target = util.target;
            console.log(target);
            this.setTint(target, args.R, args.G, args.B);
        }
        setTint (renderedTarget, R,G,B) {
            renderedTarget.tintR = R;
            renderedTarget.tintG = G;
            renderedTarget.tintB = B;
            var drawable = renderedTarget.renderer._allDrawables[renderedTarget.drawableID];

            if (drawable){
                drawable._uniforms.u_tintR = R/255.0;
                drawable._uniforms.u_tintG = G/255.0;
                drawable._uniforms.u_tintB = B/255.0;
            }
            
            if (renderedTarget.visible) {
                renderedTarget.emit('EVENT_TARGET_VISUAL_CHANGE', renderedTarget);
                renderedTarget.runtime.requestRedraw();
            }
        }
        getTint (renderedTarget){
            var rgb = ((renderedTarget.tintR&0x0ff)<<16)|((renderedTarget.tintG&0x0ff)<<8)|(renderedTarget.tintB&0x0ff);
            return rgb;
        }
        getImageResolution({URI}) {
            return new Promise(async function(resolve, reject) {
                if (!(await Scratch.canFetch(URI))) return reject();
                // eslint-disable-next-line no-restricted-syntax
                const image = new Image();
                image.onload = function() {
                    resolve(image.width.toString() + " " +image.height.toString());
                }
                image.src = URI;
            });
            

        }
    }

    Scratch.extensions.register(new Colorify());
})(Scratch);





