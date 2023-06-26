/**
 * 时间多态是科目在不同时间所呈现的不同状态。
 */
class TimeMorph {
    /** 
     * 该时间多态在一天中的时间段
     * @type {number[]} 
     */
    time
    /** 
     * 该时间多态在一周中的天数
     * @type {number} 
     */
    weekday
    /**
     * 该时间多态在一学期中的教学周段
     * @type {number[]} 
     */
    week
    /**
     * 该时间多态的教学位置
     * @type {string} 
     */
    place
    /**
     * 该时间多态的授课教师
     * @type {string} 
     */
    teacher

    /**
     * 构造时间多态实例。
     * @param {number} timeLB 时间段下界
     * @param {number} timeUB 时间段上界
     * @param {number} weekday 天数点
     * @param {number} weekLB 教学周段下界
     * @param {number} weekUB 教学周段上界
     * @param {string} place 教学位置
     * @param {string} teacher 授课教师
     */
    constructor(timeLB, timeUB, weekday, weekLB, weekUB, place, teacher) {
        this.time = [timeLB, timeUB]
        this.weekday = weekday
        this.week = [weekLB, weekUB]
        this.place = place
        this.teacher = teacher
    }
}

/**
 * 科目是对现实世界学科的抽象。
 */
class Subject {
    /** 
     * 科目名称
     * @type {string} 
     */
    name
    /**
     * 科目时间多态
     * @type {TimeMorph[]} 
     */
    timeMorph = []

    /**
     * 构造科目实例。
     * @param {string} name 科目名称
     */
    constructor(name) {
        this.name = name
    }

    /**
     * 为科目添加时间多态。
     * @param {number} timeLB 时间段下界
     * @param {number} timeUB 时间段上界
     * @param {number} weekday 天数点
     * @param {number} weekLB 教学周段下界
     * @param {number} weekUB 教学周段上界
     * @param {string} place 教学位置
     * @param {string} teacher 授课教师
     */
    addTimeMorph(timeLB, timeUB, weekday, weekLB, weekUB, place, teacher) {
        this.timeMorph.push(new TimeMorph(timeLB, timeUB, weekday, weekLB, weekUB, place, teacher))
    }

    /**
     * 返回两个科目是否相同。
     * @param {Subject} anotherSubject
     * @returns {boolean}
     */
    equals(anotherSubject) {
        return this.name == anotherSubject.name
    }
}

/**
 * 学期是科目在一段时间内离散状态的集合。
 */
class Term {
    /**
     * 开始日期
     * @type {Date}
     */
    startDate
    /**
     * 科目
     * @type {Subject[]}
     */
    subjects = []

    /**
     * 构造学期实例。可产生空白实例或依据 JSON 结构化。
     * @param {string} json 序列化的 JSON 字符串
     */
    constructor(json) {
        if (json) {
            try {
                const data = JSON.parse(json)
                this.startDate = new Date(data.startDate)
                for (let subjectData of data.subjects) {
                    let subject = new Subject(subjectData.name)
                    for (let timeMorphData of subjectData.timeMorph) {
                        let timeMorph = new TimeMorph(
                            parseInt(timeMorphData.time[0]),
                            parseInt(timeMorphData.time[1]),
                            parseInt(timeMorphData.weekday),
                            parseInt(timeMorphData.week[0]),
                            parseInt(timeMorphData.week[1]),
                            timeMorphData.place,
                            timeMorphData.teacher
                        )
                        subject.timeMorph.push(timeMorph)
                    }
                    this.subjects.push(subject)
                }
            } catch (e) { }
        }
    }

    /**
     * 获取学期实例。
     * *注意，该方法应当取代构造器来被使用，除非用户对类结构了如指掌。*
     * @param {string} mode 文件模式（学校代号）
     * @param {file} file 文件实体
     * @returns {Term}
     */
    static async getInstance(mode, file) {
        const discreteWeeksAnalyze = (record, weekPart) => {
            let records = []
            let weekParts = weekPart.split(",")
            weekParts.forEach((wp) => {
                records.push(record.replace(weekPart, wp))
            })
            return records
        }
        const getWeekdayNumber = (weekday) => {
            return {
                '星期一': 1,
                '星期二': 2,
                '星期三': 3,
                '星期四': 4,
                '星期五': 5,
                '星期六': 6,
                '星期日': 7
            }[weekday]
        }
        let t = new Term()
        switch (mode) {
            case 'HFUU': case 'hfuu':
                const dateObj = await t.parseExcel(file, "A8")
                const subObj = await t.parseExcel(file, "C2:I7")
                t.startDate = new Date(dateObj.match(/(\d{4}-\d{2}-\d{2})/)[0])
                subObj.forEach(s => { // s 表示每个科目
                    Object.keys(s).forEach(key => { // key 表示每个科目名
                        let superposition = s[key].split("\n")
                        superposition.forEach(ss => { // superposition 表示每条记录
                            let dss = discreteWeeksAnalyze(ss, ss.split("/")[1].split(")")[1])
                            dss.forEach(sc => { // sc 表示按教学周段再次切割后的每条记录
                                let cols = sc.split("/")
                                t.addSubjectCut(
                                    cols[0],
                                    cols[1].match(/(\d{1,2}-\d{1,2})/)[0].split("-")[0],
                                    cols[1].match(/(\d{1,2}-\d{1,2})/)[0].split("-")[1],
                                    getWeekdayNumber(key),
                                    cols[1].match(/(\d{1,2}(-\d{1,2})?)/g)[1].split("-")[0],
                                    cols[1].match(/(\d{1,2}(-\d{1,2})?)/g)[1].split("-")[1] || cols[1].match(/(\d{1,2}(-\d{1,2})?)/g)[1],
                                    cols[2],
                                    cols[3]
                                )
                            })

                        })
                    })
                })
                break
            case 'AHTCM': case 'ahtcm':
                break
            default:
                console.error("尚未添加对您学校的支持......")
        }
        return t
    }

    /** 
     * 解析 Excel 文件并结构化。
     * @param {file} file 
     * @param {string} range 
     * @return {object}
     */
    parseExcel(file, range) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()

            reader.onload = function (e) {
                try {
                    const data = new Uint8Array(e.target.result)
                    const workbook = XLSX.read(data, { type: 'array' })
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
                    if (range.includes(":"))
                        resolve(XLSX.utils.sheet_to_json(worksheet, { range }))
                    else
                        resolve(worksheet[range].v)
                } catch (error) {
                    reject(error)
                }
            }

            reader.onerror = function (e) {
                reject(e.target.error)
            }

            reader.readAsArrayBuffer(file)
        })
    }

    /**
     * 检索学期对象内是否有指定名称的科目。
     * @param {string} name 科目名称
     * @returns {boolean}
     */
    hasSubject(name) {
        let flag = false
        this.subjects.forEach(s => {
            if (s.name == name)
                flag = true
        })
        return flag
    }

    /**
     * 获取指定名称对应科目的引用。
     * @param {string} name 科目名称
     * @returns {Subject}
     */
    getSubject(name) {
        let flag = null
        this.subjects.forEach(s => {
            if (s.name == name)
                flag = s
        })
        return flag
    }

    /**
     * 获得特定时间的切片。
     * @param {Date} moment 时刻（天）
     * @returns {Cut[]}
     */
    getTodayCuts(moment) {
        let cuts = []
        const weekOfTerm = Math.floor((moment - this.startDate) / 1000 / 60 / 60 / 24 / 7) + 1
        const dayOfWeek = moment.getDay()
        this.subjects.forEach(s => {
            s.timeMorph.forEach(tm => {
                if (tm.week[0] <= weekOfTerm && weekOfTerm <= tm.week[1])
                    if (tm.weekday == dayOfWeek)
                        cuts.push(new Cut(s.name, tm.time[0], tm.time[1], tm.place, tm.teacher))
            })
        })
        return Object.freeze(cuts.sort((cutA, cutB) => {
            return cutA.time[0] - cutB.time[0]
        }))
    }

    /**
     * 获取特定时间在学期中的周数。
     * @param {Date} moment 时刻（天）
     * @returns {number}
    */
    getWeek(moment) {
        const week = Math.floor((moment - this.startDate) / 1000 / 60 / 60 / 24 / 7) + 1
        if (week > 0)
            return week
        return week - 1
    }

    /**
     * 添加科目切片到学期中。
     * @param {string} name 科目名称
     * @param {number} timeLB 时间段下界
     * @param {number} timeUB 时间段上界
     * @param {number} weekday 天数点
     * @param {number} weekLB 教学周段下界
     * @param {number} weekUB 教学周段上界
     * @param {string} place 教学位置
     * @param {string} teacher 授课教师
     */
    addSubjectCut(name, timeLB, timeUB, weekday, weekLB, weekUB, place, teacher) {
        if (!this.hasSubject(name))
            this.subjects.push(new Subject(name))
        this.getSubject(name).addTimeMorph(timeLB, timeUB, weekday, weekLB, weekUB, place, teacher)
    }
}

/**
 * 学期在特定时间的切片，时间多态坍塌成为确定态。
 */
class Cut {
    /**
     * 科目名称
     * @type {string}
     */
    name
    /**
     * 科目时间段
     * @type {number[]}
     */
    time
    /**
     * 教学位置
     * @type {string}
     */
    place
    /**
     * 授课教师
     * @type {string}
     */
    teacher

    /**
     * 构造切片实例。
     * @param {string} name 科目名称
     * @param {number} timeLB 时间段下界
     * @param {number} timeUB 时间段上界
     * @param {string} place 教学位置
     * @param {string} teacher 授课教师
     */
    constructor(name, timeLB, timeUB, place, teacher) {
        this.name = name
        this.time = [timeLB, timeUB]
        this.place = place
        this.teacher = teacher
    }
}