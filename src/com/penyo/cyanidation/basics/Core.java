/* 
 * Copyright (c) Penyo. All rights reserved.
 */

package com.penyo.cyanidation.basics;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;

/**
 * 该类用于处理明文和密文之间的转换。
 * 
 * @author Penyo
 */
public class Core {
    /** 课程表文件默认路径 */
    public File defaultPath = new File("CS.txt");

    /** 整个课程表的概要，包含标题和开学日期 */
    public String[] csGist = new String[2];

    /** 周数偏移 */
    public int weekSkewing = 0;

    /** 周数上限 */
    public int weekLimit = 20;

    /** 课程表数据缓存 */
    private ArrayList<ClassInfo> cs = new ArrayList<>();

    /** 来自程序本身的操作 */
    private boolean fromCore = false;

    /**
     * 该方法用于刷新当前课程表（回到当前周）。
     * 
     * @param path 文件路径。
     * @return 课程表数据。
     */
    public String[] reflash(String path) {
        try {
            FileInputStream ioCS = new FileInputStream(path == null ? defaultPath : new File(path));
            return parse(ioCS);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return new String[35];
    }

    /**
     * 该方法用于读取本地课程表文件。
     * 
     * @param ioCS 字节流化的课程表文件。
     * @return 课程表数据。
     */
    public String[] parse(FileInputStream ioCS) {
        try {
            byte[] parsedCS_I = new byte[ioCS.available()];
            ioCS.read(parsedCS_I);
            String[] parsedCS_II = new String(parsedCS_I).split("\\$");
            csGist = parsedCS_II[0].split("@");

            if (fromCore) {
                fromCore = false;
                return new String[35];
            }

            cs = new ArrayList<>();
            for (int i = 1; i < parsedCS_II.length; i++)
                cs.add(new ClassInfo(parsedCS_II[i]));
            String[] result = new String[35];
            int i = getWeek() + weekSkewing;
            for (ClassInfo thisCS : cs)
                for (ClassInfo.TimeMoph tm : thisCS.timeMophPack)
                    if (tm.weekBegin <= i && tm.weekEnd >= i)
                        result[(tm.phaseOfDay - 1) * 7 + (tm.dayOfWeek - 1)] = "" + thisCS.gist[0] + " / " + tm.spInfo
                                + "\n" + thisCS.gist[1];
            return result;
        } catch (Exception e) {
            e.printStackTrace();
        }
        return new String[35];
    }

    /**
     * 该方法用于保存课程表文件。
     * 
     * @param path    文件路径。
     * @param contain 课程表的内容。
     */
    public void save(String path, String contain) {
        try (FileOutputStream f = new FileOutputStream(path);) {
            f.write(contain.getBytes());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * 该方法用于获取当前周在既定学期内的位置。
     * 
     * @return 周数。
     */
    public int getWeek() {
        try {
            fromCore = true;
            reflash(null);
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
            Date start = sdf.parse(csGist[1]), now = new Date();
            return (int) ((now.getTime() - start.getTime()) / 1000.0 / 60 / 60 / 24 / 7) + 1;
        } catch (Exception e) {
            e.printStackTrace();
        }
        return -1;
    }

    /**
     * 该方法用于随机获取句子——仅仅是一个小彩蛋。
     * 
     * @return 句子。
     */
    public String getSentence() {
        int rd = (int) (Math.random() * 114514);
        return switch (rd % 7) {
            case 0 -> "要在文化上有成绩，则非韧不可。 ——鲁迅";
            case 1 -> "倘只看书，便变成书橱。 ——鲁迅";
            case 2 -> "但我坦然，欣然，我将大笑，我将歌唱。 ——鲁迅";
            case 3 -> "改造自己，总比禁止别人来的难。 ——鲁迅";
            case 4 -> "心事浩茫连广宇，于无声处听惊雷。 ——鲁迅";
            case 5 -> "自由固不是钱所买到的，但能够为钱而卖掉。 ——鲁迅";
            case 6 -> "人生得一知已足矣，斯世当以同怀视之。 ——鲁迅";
            default -> "丢掉幻想，准备斗争。 ——毛泽东";
        };
    }
}