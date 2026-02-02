Page({
  data: {
    shortLink: '',
    lastPlatform: '',
    parsedMediaUrl: '',
    allImages: [],  // 所有图片URL列表
    selectedImages: [],  // 选中的图片索引
    isParsing: false,
    logs: [],
    // 后端API地址，部署时需要修改为实际服务器地址
    // 本地开发使用 127.0.0.1，生产环境必须使用HTTPS
    // 方案1：使用域名（推荐）- 等域名审核通过后启用
    apiBaseUrl: 'https://www.egoistcookie.top'  // ✅ 域名：www.egoistcookie.top（等审核通过后使用）
    // 方案2：本地开发使用（暂时注释）
    //apiBaseUrl: 'http://127.0.0.1:5000'  // 本地开发测试用
    // 方案3：使用IP（需要配置HTTPS，不推荐，微信小程序可能不接受）
    //apiBaseUrl: 'https://120.77.92.36'  // 如果使用IP，需要配置自签名证书（不推荐） 
  },

  onLoad() {
    // 页面加载完成
  },

  // 输入短链
  onShortLinkInput(e) {
    this.setData({
      shortLink: e.detail.value
    })
  },

  // 追加日志
  addLog(message, detail = '') {
    const time = new Date()
    const timeStr = [time.getHours(), time.getMinutes(), time.getSeconds()]
      .map((num) => num.toString().padStart(2, '0'))
      .join(':')
    const content = detail ? `${message} - ${detail}` : message
    this.setData({
      logs: [`[${timeStr}] ${content}`, ...this.data.logs].slice(0, 50) // 只保留最近50条
    })
  },

  // 调用后端API解析短链
  async parseShortLinkWithAPI(shortLink) {
    return new Promise((resolve, reject) => {
      this.addLog('调用后端API解析', shortLink)
      const apiUrl = `${this.data.apiBaseUrl}/api/parse`
      console.log('API请求URL:', apiUrl)
      console.log('API请求数据:', { short_link: shortLink })
      
      wx.request({
        url: apiUrl,
        method: 'POST',
        header: {
          'Content-Type': 'application/json'
        },
        data: {
          short_link: shortLink
        },
        timeout: 30000,
        success: (res) => {
          console.log('API响应状态码:', res.statusCode)
          console.log('API响应数据:', res.data)
          
          if (res.statusCode === 200) {
            if (res.data && res.data.success) {
              console.log('API解析成功，返回数据:', res.data.data)
              this.addLog('API响应成功', JSON.stringify(res.data.data).substring(0, 100))
              resolve(res.data.data)
            } else {
              const errorMsg = res.data?.error || 'API返回success=false'
              console.error('API返回错误:', errorMsg)
              this.addLog('API返回错误', errorMsg)
              reject(new Error(errorMsg))
            }
          } else {
            const errorMsg = `HTTP ${res.statusCode}: ${res.data?.error || '请求失败'}`
            console.error('API请求失败:', errorMsg)
            this.addLog('API请求失败', errorMsg)
            reject(new Error(errorMsg))
          }
        },
        fail: (err) => {
          console.error('API请求异常:', err)
          const errorMsg = err.errMsg || '网络请求失败'
          this.addLog('API请求异常', errorMsg)
          reject(new Error(errorMsg))
        }
      })
    })
  },

  // 构造用于展示/下载的最终图片URL
  // useProxy: true=强制使用代理, false=直接使用原始URL, undefined=自动判断
  buildImageUrl(rawUrl, platform = '', useProxy = undefined) {
    if (!rawUrl) return ''
    let finalImageUrl = rawUrl.trim()
    if (!finalImageUrl.startsWith('http')) {
      finalImageUrl = 'https://' + finalImageUrl
    }
    if (finalImageUrl.startsWith('http://')) {
      finalImageUrl = finalImageUrl.replace('http://', 'https://')
    }

    const apiBaseUrl = this.data.apiBaseUrl || ''
    
    // 如果没有配置后端地址，直接返回原始URL
    if (!apiBaseUrl) {
      return finalImageUrl
    }

    // 判断是否为本地开发环境
    const isLocalHttp = apiBaseUrl.startsWith('http://127.0.0.1') || 
                        apiBaseUrl.startsWith('http://localhost')
    
    // 如果明确指定不使用代理，直接返回原始URL
    if (useProxy === false) {
      return finalImageUrl
    }

    // 本地开发环境：直接返回原始URL（需要在开发工具中配置域名白名单）
    if (isLocalHttp) {
      console.warn('本地开发环境，图片URL未走代理，需要在开发工具中配置域名白名单')
      return finalImageUrl
    }

    // 如果明确指定使用代理，或者未指定（自动判断），则使用代理
    // 生产环境：使用代理避免域名白名单问题
    let proxyBase = apiBaseUrl
    if (proxyBase.startsWith('http://')) {
      proxyBase = proxyBase.replace('http://', 'https://')
    }
    
    // 使用后端图片代理接口
    const proxyUrl = `${proxyBase}/api/image_proxy?url=${encodeURIComponent(finalImageUrl)}`
    return proxyUrl
  },

  // 从输入文本中提取 URL
  extractUrlFromText(text) {
    if (!text) return ''
    
    // 匹配 http://xhslink.com 或 https://xhslink.com 开头的 URL
    const urlPattern = /(https?:\/\/xhslink\.com\/[^\s\u4e00-\u9fa5，。！？；：""''（）【】\n\r]+)/i
    const match = text.match(urlPattern)
    
    if (match && match[1]) {
      return match[1].trim()
    }
    
    // 如果没有匹配到，尝试匹配任何 http/https URL
    const generalUrlPattern = /(https?:\/\/[^\s\u4e00-\u9fa5，。！？；：""''（）【】\n\r]+)/i
    const generalMatch = text.match(generalUrlPattern)
    
    return generalMatch && generalMatch[1] ? generalMatch[1].trim() : ''
  },

  // 解析小红书短链获取无水印媒体
  async parseShortLink() {
    const inputText = (this.data.shortLink || '').trim()
    if (!inputText) {
      wx.showToast({
        title: '请输入短链',
        icon: 'none'
      })
      return
    }

    // 从输入文本中提取 URL
    const link = this.extractUrlFromText(inputText)
    if (!link) {
      this.addLog('提取URL失败', '未在输入中找到有效的URL')
      wx.showToast({
        title: '未找到有效的短链URL',
        icon: 'none'
      })
      return
    }
    
    this.addLog('提取到URL', link)

    this.setData({
      isParsing: true,
      parsedMediaUrl: '',
      allImages: [],
      selectedImages: []
    })
    this.addLog('开始解析短链', link)

    try {
      // 调用后端API解析
      const apiData = await this.parseShortLinkWithAPI(link)
      
      console.log('API返回的完整数据:', apiData)
      this.addLog('API解析成功', `找到 ${apiData.all_images?.length || 0} 张图片`)

      const platform = (apiData.platform || '').toLowerCase() || (link.includes('doubao.com') ? 'doubao' : 'xhs')
      this.setData({ lastPlatform: platform })
      
      // 主图
      const mediaUrl = apiData.image_url
      if (!mediaUrl) {
        console.error('API未返回image_url字段')
        throw new Error('API未返回图片URL')
      }
      
      console.log('原始图片URL:', mediaUrl)
      this.addLog('解析到媒体地址', mediaUrl)

      const finalImageUrl = this.buildImageUrl(mediaUrl, platform)
      console.log('处理后的图片URL:', finalImageUrl)
      this.addLog('处理后的URL', finalImageUrl)

      // 处理所有图片URL（小红书分支额外过滤掉明显异常/403较高风险的URL）
      const allImages = apiData.all_images || []
      let filteredImages = allImages
      if (platform !== 'doubao') {
        // 小红书：过滤异常URL
        filteredImages = allImages.filter((url) => {
          const u = (url || '').trim()
          if (!u || !u.startsWith('http')) return false
          // 去掉带 CSS background 样式的拼接串
          if (u.indexOf(');background') !== -1) return false
          // 去掉纯域名根路径
          if (u === 'https://sns-webpic-qc.xhscdn.com' || u === 'https://sns-webpic-qc.xhscdn.com/') return false
          // 小红书很多图片URL没有 .jpg/.png 后缀，常以 !nd_... 结尾（例如 !nd_dft_wlteh_webp_3）
          const isXhsCdn = /xhscdn\.com/i.test(u) || /xiaohongshu\.com/i.test(u)
          if (!isXhsCdn) return false
          // 允许：带常见图片后缀 或 含 !nd_ 这类处理后缀 或 包含 notes_pre_post 路径
          const hasExt = /\.(jpe?g|png|webp|gif)([?#].*|$)/i.test(u)
          const hasNdSuffix = /!nd_[a-z0-9_]+/i.test(u)
          const hasNotesPath = /\/notes_pre_post\//i.test(u)
          return hasExt || hasNdSuffix || hasNotesPath
        })
      } else {
        // 豆包：只显示水印图（避免无水印候选 403）
        filteredImages = allImages.filter((url) => {
          const u = (url || '').trim()
          if (!u || !u.startsWith('http')) return false
          return u.indexOf('~tplv-') !== -1 || u.indexOf('watermark') !== -1
        })
      }

      const processedImages = filteredImages.map((url, index) => {
        const raw = (url || '').trim()
        // 暂时使用原始URL（显示和下载都用原始URL）
        // 需要在微信后台配置小红书CDN域名为downloadFile合法域名
        const displayUrl = this.buildImageUrl(raw, platform, false)  // 显示用原始URL
        const downloadUrl = this.buildImageUrl(raw, platform, false)  // 下载也用原始URL（暂时）
        return {
          url: displayUrl,        // 用于展示的URL（原始URL）
          downloadUrl: downloadUrl,  // 用于下载的URL（原始URL，需要在后台配置域名白名单）
          rawUrl: raw,            // 保留原始URL以便调试
          selected: false,        // 选中状态
          index: index
        }
      })

      // 设置所有图片URL
      this.setData({
        parsedMediaUrl: finalImageUrl,  // 保留第一个作为主要显示
        allImages: processedImages,
        selectedImages: []  // 重置选中状态
      })

      wx.showToast({
        title: `解析成功，找到${processedImages.length}张图片`,
        icon: 'success',
        duration: 2000
      })
    } catch (error) {
      const msg = error?.message || '解析失败'
      this.addLog('解析失败', msg)
      console.error('解析错误:', error)
      wx.showToast({
        title: msg.length > 20 ? msg.substring(0, 20) + '...' : msg,
        icon: 'none',
        duration: 3000
      })
    } finally {
      this.setData({
        isParsing: false
      })
    }
  },

  // 切换图片选中状态
  toggleImageSelect(e) {
    const index = e.currentTarget.dataset.index
    const { allImages, selectedImages } = this.data
    
    // 切换选中状态
    const image = allImages[index]
    image.selected = !image.selected
    
    // 更新selectedImages数组
    if (image.selected) {
      if (selectedImages.indexOf(index) === -1) {
        selectedImages.push(index)
      }
    } else {
      const idx = selectedImages.indexOf(index)
      if (idx > -1) {
        selectedImages.splice(idx, 1)
      }
    }
    
    this.setData({
      allImages: allImages,
      selectedImages: selectedImages
    })
    
    console.log('选中状态:', selectedImages)
  },

  // 全选/取消全选
  toggleSelectAll() {
    const { allImages, selectedImages } = this.data
    const isAllSelected = selectedImages.length === allImages.length
    
    // 更新所有图片的选中状态
    allImages.forEach((image, index) => {
      image.selected = !isAllSelected
    })
    
    // 更新selectedImages数组
    const newSelectedImages = isAllSelected ? [] : allImages.map((_, index) => index)
    
    this.setData({
      allImages: allImages,
      selectedImages: newSelectedImages
    })
  },

  // 下载选中的图片
  downloadSelectedImages() {
    const { allImages, selectedImages } = this.data
    
    if (selectedImages.length === 0) {
      wx.showToast({
        title: '请先选择要下载的图片',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: `下载中(0/${selectedImages.length})...`
    })

    const imagesToDownload = selectedImages.map(index => {
      const image = allImages[index]
      // 优先使用downloadUrl（代理URL），如果没有则使用url
      return image?.downloadUrl || image?.url || image
    })
    let successCount = 0
    let failCount = 0
    let currentIndex = 0

    // 递归下载图片
    const downloadNext = () => {
      if (currentIndex >= imagesToDownload.length) {
        wx.hideLoading()
        const message = `下载完成：成功${successCount}张，失败${failCount}张`
        this.addLog('批量下载完成', message)
        wx.showToast({
          title: message,
          icon: successCount > 0 ? 'success' : 'none',
          duration: 3000
        })
        // 清空选中状态
        this.setData({
          selectedImages: []
        })
        return
      }

      const imageUrl = imagesToDownload[currentIndex]
      currentIndex++
      
      wx.showLoading({
        title: `下载中(${currentIndex}/${selectedImages.length})...`
      })

      this.addLog(`下载第${currentIndex}张`, imageUrl)

      // 下载函数，支持降级重试
      const tryDownload = (url, isRetry = false) => {
        wx.downloadFile({
          url: url,
          success: (res) => {
            if (res.statusCode === 200 && res.tempFilePath) {
              wx.saveImageToPhotosAlbum({
                filePath: res.tempFilePath,
                success: () => {
                  successCount++
                  this.addLog(`第${currentIndex}张保存成功`, isRetry ? '(使用原始URL)' : '')
                  downloadNext()
                },
                fail: (err) => {
                  failCount++
                  console.error(`保存第${currentIndex}张失败:`, err)
                  this.addLog(`第${currentIndex}张保存失败`, err.errMsg || '未知错误')
                  downloadNext()
                }
              })
            } else {
              // 如果是代理URL返回404/500等错误，尝试使用原始URL
              if (!isRetry && imageUrl.includes('/api/image_proxy')) {
                const image = allImages[selectedImages[currentIndex - 1]]
                const rawUrl = image?.rawUrl || image?.url
                if (rawUrl && rawUrl !== imageUrl) {
                  this.addLog(`代理失败，尝试原始URL`, `状态码：${res.statusCode}`)
                  tryDownload(rawUrl, true)
                  return
                }
              }
              failCount++
              this.addLog(`第${currentIndex}张下载失败`, `状态码：${res.statusCode}`)
              if (res.statusCode === 404) {
                this.addLog('提示', '后端代理服务可能未部署，请检查后端服务或配置域名白名单')
              }
              downloadNext()
            }
          },
          fail: (err) => {
            // 如果是代理URL失败，尝试使用原始URL
            if (!isRetry && imageUrl.includes('/api/image_proxy')) {
              const image = allImages[selectedImages[currentIndex - 1]]
              const rawUrl = image?.rawUrl || image?.url
              if (rawUrl && rawUrl !== imageUrl) {
                this.addLog(`代理请求异常，尝试原始URL`, err.errMsg || '未知错误')
                tryDownload(rawUrl, true)
                return
              }
            }
            failCount++
            console.error(`下载第${currentIndex}张异常:`, err)
            this.addLog(`第${currentIndex}张下载异常`, err.errMsg || '未知错误')
            if (err.errMsg && err.errMsg.includes('not in domairlist')) {
              this.addLog('提示', '需要在小程序后台配置downloadFile合法域名，或使用后端代理')
            }
            downloadNext()
          }
        })
      }

      tryDownload(imageUrl)
    }

    downloadNext()
  },

  // 下载单张图片（兼容旧代码）
  downloadImage(e) {
    const index = e?.currentTarget?.dataset?.index
    const { allImages, parsedMediaUrl } = this.data
    
    let imageUrl
    if (index !== undefined) {
      // 从列表下载
      const image = allImages[index]
      // 优先使用downloadUrl（代理URL），如果没有则使用url
      imageUrl = image?.downloadUrl || image?.url || image
    } else {
      // 下载第一张（兼容）
      imageUrl = parsedMediaUrl
    }

    if (!imageUrl) {
      wx.showToast({
        title: '没有可下载的图片',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '下载中...'
    })

    this.addLog('开始下载图片', imageUrl)

    // 下载函数，支持降级重试
    const tryDownload = (url, isRetry = false) => {
      wx.downloadFile({
        url: url,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.hideLoading()
                this.addLog('图片已保存到相册', isRetry ? '(使用原始URL)' : '')
                wx.showToast({
                  title: '保存成功',
                  icon: 'success'
                })
              },
              fail: (err) => {
                wx.hideLoading()
                if (err.errMsg.includes('auth deny')) {
                  wx.showModal({
                    title: '提示',
                    content: '需要授权访问相册才能保存图片',
                    showCancel: false
                  })
                } else {
                  this.addLog('保存失败', err.errMsg || '未知错误')
                  wx.showToast({
                    title: '保存失败',
                    icon: 'none'
                  })
                }
              }
            })
          } else {
            // 如果是代理URL返回404/500等错误，尝试使用原始URL
            if (!isRetry && imageUrl.includes('/api/image_proxy')) {
              let rawUrl = imageUrl
              if (index !== undefined) {
                const image = allImages[index]
                rawUrl = image?.rawUrl || image?.url
              } else {
                rawUrl = parsedMediaUrl
              }
              if (rawUrl && rawUrl !== imageUrl) {
                this.addLog('代理失败，尝试原始URL', `状态码：${res.statusCode}`)
                tryDownload(rawUrl, true)
                return
              }
            }
            wx.hideLoading()
            this.addLog('下载失败', `状态码：${res.statusCode}`)
            if (res.statusCode === 404) {
              this.addLog('提示', '后端代理服务可能未部署，请检查后端服务或配置域名白名单')
            }
            wx.showToast({
              title: '下载失败',
              icon: 'none'
            })
          }
        },
        fail: (err) => {
          // 如果是代理URL失败，尝试使用原始URL
          if (!isRetry && imageUrl.includes('/api/image_proxy')) {
            let rawUrl = imageUrl
            if (index !== undefined) {
              const image = allImages[index]
              rawUrl = image?.rawUrl || image?.url
            } else {
              rawUrl = parsedMediaUrl
            }
            if (rawUrl && rawUrl !== imageUrl) {
              this.addLog('代理请求异常，尝试原始URL', err.errMsg || '未知错误')
              tryDownload(rawUrl, true)
              return
            }
          }
          wx.hideLoading()
          this.addLog('下载异常', err?.errMsg || '未知错误')
          if (err.errMsg && err.errMsg.includes('not in domairlist')) {
            this.addLog('提示', '需要在小程序后台配置downloadFile合法域名，或使用后端代理')
          }
          wx.showToast({
            title: '下载失败',
            icon: 'none',
            duration: 3000
          })
        }
      })
    }

    tryDownload(imageUrl)
  }
})
