import Marked from 'marked'
import codeHighlight from './code-highlight'
import styleString from './styles/index.less'
console.log(require('./styles/index.less'))

const styleFragment = document.createElement('style')
styleFragment.innerHTML = styleString
document.head.append(styleFragment)

const	markdownTextCache = new Map()
const promiseMap = new Map()
const LAZY_LOAD_SPEC = 'js-md-lazy-load'

export default class MarkdownParser extends HTMLElement {
	markdownText = ''
	entityNid = ''
	subDependencies = []
	_tocs = []
	$container = this 

	constructor(options) {
		super()
		this.mountPromise = new Promise((resolve, reject) => {
			promiseMap.set(this, [ resolve, reject ])
		})
	}	


	async connectedCallback() {
		this.init()
		const [ resolve, reject ] = promiseMap.get(this)
		try {
			await this.mount()
			resolve(this)
		} catch(e) {
			reject(e)
		}
	}

	init() {
		this.presentableId = this.getAttribute('presentableId') || ''
	}

	async mount() {
		if (this.presentableId === '') {
			throw new Error(`PresentableId不能为空`)
			return 
		}
		await this.getMarkdownData(this.presentableId)
		if (this.authError == null) {
			this.renderMarkdown()
			this.createlazyLoader()
		} else {
			// 授权出错
		}
	}

	async getMarkdownData(presentableId) {
		let tmpMD = markdownTextCache.get(presentableId)
		if (tmpMD == null) {
			var response = await window.FreelogApp.QI.getPresentableData(presentableId)
			
			if (response.headers.get('freelog-resource-type') != null) {
				const subDependenciesString = Buffer.from(response.headers.get('freelog-sub-dependencies'),'base64').toString('utf-8')
				const subDependencies = JSON.parse(subDependenciesString)
				const entityNid = response.headers.get('freelog-entity-nid')
				const markdownText = await response.text()
				tmpMD = { markdownText, entityNid, subDependencies, authError: null }
			} else {
				const authError = await response.json()
				tmpMD = { markdownText: '', entityNid: '', subDependencies: [], authError }
			}
			markdownTextCache.set(presentableId, tmpMD)
		}
		const { markdownText = '', entityNid = '',  subDependencies = [], authError } = tmpMD
		this.entityNid = entityNid
		this.subDependencies = subDependencies
		this.authError = authError
		this.markdownText = markdownText
	}

	renderMarkdown() {
		const markdownHTML = this.resolveMarkdown(this.markdownText)
		this.$container.innerHTML = `
			<div class="">
				<div class="md-main-content markdown-body">${markdownHTML}</div>
			</div>`
	}

	resolveMarkdown(markdownText) {
		
		const renderer = new Marked.Renderer()

    Marked.setOptions({
      renderer: this.resetRenderer(renderer),
      highlight: function (code, type) {
        return codeHighlight(code)
      },
      pedantic: false,
      gfm: true,
      tables: true,
      breaks: false,
      sanitize: false,
      smartLists: true,
      smartypants: false,
      xhtml: false
    })
		return Marked(this.markdownText)
	}

	resetRenderer(renderer) {
		renderer.heading = this.resetHeading()
		renderer.image = this.resetImageRenderer(renderer)
		return renderer
	}

	resetHeading() {
		var index = 0
		return (text, level) => {
			const anchor = `nav_anchor_${level}_${index++}`
			if (level <= 4) {
				this._tocs.push({ level, anchor, text })
			}
			return `<h${level} id="${anchor}"><a href="#${anchor}" class="anchor"></a></a>${text}</h${level}>`
		}
	}

	resetImageRenderer(renderer) {
		const rawRendererImage = renderer.image
		let resIndex = 0
		return (href, title, text) => {
			if (text.replace(/^(\s*)|(\s*)$/g, '') === 'freelog-resource') {
				const [ name, queryString ] = href.split('?')
				const size = this.getImgSizeByQueryStr(queryString) 
				const resourceId = this.getResourceIdByName(name)
				if (resourceId) {
					var img = new Image()
          var imgId = `resource_img_${resIndex++}`
          img.id = imgId
          img.src = "//visuals.oss-cn-shenzhen.aliyuncs.com/loading.gif"
          img.alt = text
          if (size.width) {
            img.width = size.width
          }
          if (size.height) {
            img.height = size.height
          }
          img.dataset.resourceId = resourceId
          img.classList.add(LAZY_LOAD_SPEC)
          title && (img.title = title)
          return img.outerHTML
				}
			} else {
				return rawRendererImage.apply(renderer, [href, title, text])
			}
		}
	}

	getImgSizeByQueryStr(queryString = '') {
    const size = {}
    if (queryString !== '') {
      const tmpArr = queryString.split('&')
      for (const item of tmpArr) {
        const [ key, val] = item.split('=')
        size[key] = val
      }
    }
    return size
	}
	
	getResourceIdByName(name) {
		for (let item of this.subDependencies) {
			if (item.name === name) {
				return item.id
			}
		}
		return ''
	}

  createlazyLoader() {
    var observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio <= 0) {
            return
					}
          var $target = entry.target
          var resourceId = $target.dataset.resourceId
					Reflect.deleteProperty($target.dataset, resourceId)
					this.loadFreelogResource(resourceId, $target)
          observer.unobserve($target)
        })
      }
		)
		
		window.addEventListener('scroll', () => {
			window.requestAnimationFrame(() => {
				const $lazyDoms = this.querySelectorAll(`.${LAZY_LOAD_SPEC}`)
				for (const $dom of $lazyDoms) {
					$dom.classList.remove(LAZY_LOAD_SPEC)
					observer.observe($dom)
				}
			})
		})
		
  }

  async loadFreelogResource(subResourceId, $target) {
		try {
			const _response = await window.FreelogApp.QI.getPresentableSubDependData(this.presentableId, subResourceId, this.entityNid)
			const type = _response.headers.get('freelog-resource-type')
			if (type) {
				const blob = await _response.blob()
				switch (type) {
					case 'video':
						this.renderVideo($target, blob)
						break
					case 'meme':
						this.renderMeme($target, blob)
						break
					case 'image':
					default:
						this.renderImage($target, blob)
				}
			}
		} catch(e) {
			console.error('LoadFreelogResource:', e)
		}
  }

  renderImage($el, blob){
    var src = URL.createObjectURL(blob)
    if ($el.nodeName !== 'IMG') {
      var $image = document.createElement('img')
      $image.src = src
      $el.replaceWith($image)
    } else {
      $el.src = src
    }
	}
	
  renderMeme($el, blob){}

  renderVideo($el, blob){
    var id = 'js-video-'+Math.random().toString().slice(3,8)
    var $video = document.createElement('video')
    $video.style.cssText = 'width: 100%;height: 100%;'
    $video.controls = 'controls'
    // $video.autoplay = 'false'
    $video.id= id
    $el.replaceWith($video)
    setTimeout(()=>{
      $video.src = URL.createObjectURL(blob)
    })
  }
}

customElements.define('freelog-markdown-parser', MarkdownParser)
