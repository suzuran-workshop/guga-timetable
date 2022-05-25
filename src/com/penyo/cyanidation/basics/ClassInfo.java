/* 
 * Copyright (c) Penyo. All rights reserved.
 */

package com.penyo.cyanidation.basics;

import java.util.ArrayList;

/**
 * 该类用于抽象不同名称、授课教师的课程。
 * 
 * @author Penyo
 */
public class ClassInfo {
    /** 课程概要，包含课程名称和授课教师姓名 */
    public String[] gist;

    /** 课程因时间而多态化的信息 */
    public ArrayList<TimeMoph> timeMophPack = new ArrayList<>();

    /**
     * 该类用于进一步抽象不同时间的同一课程。
     * 
     * @author Penyo
     */
    public class TimeMoph {
        /** 与课程相关的时间信息 */
        int weekBegin, weekEnd, dayOfWeek, phaseOfDay;

        /** 对课程在单一时间段下的注释 */
        String spInfo;

        /**
         * 该构造器用于接收课程信息碎片来对其抽象实例化。
         * 
         * @param infoCut 课程信息碎片。
         */
        public TimeMoph(String infoCut) {
            String[] info = infoCut.split("@");
            dayOfWeek = info[0].charAt(0) - '0';
            phaseOfDay = info[0].charAt(3) - '0';
            weekBegin = Integer.parseInt(info[0].substring(7, 9));
            weekEnd = Integer.parseInt(info[0].substring(11, 13));
            try {
                spInfo = info[1];
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    /**
     * 该构造器用于接收课程信息来对其抽象实例化。
     * 
     * @param entireInfo 课程信息。
     */
    public ClassInfo(String entireInfo) {
        String[] infoCut = entireInfo.split("\n");
        gist = infoCut[0].split("@");
        for (int i = 1; i < infoCut.length; i++)
            timeMophPack.add(new TimeMoph(infoCut[i]));
    }
}
